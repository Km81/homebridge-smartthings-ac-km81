// lib/SmartThings.js v2.4.7
'use strict';

const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const { LRUCache } = require('lru-cache');
const { default: axiosRetry } = require('axios-retry');

// 사용 기능만 남긴 Capability ID
const CAPABILITY = {
  OPTIONAL_MODE: 'custom.airConditionerOptionalMode', // windFree on/off
  AUTO_CLEANING: 'custom.autoCleaningMode',          // autoClean on/off
  SWITCH: 'switch',
  MODE: 'airConditionerMode',
  COOL_SETPOINT: 'thermostatCoolingSetpoint',
  TEMP: 'temperatureMeasurement',
};

class SmartThings {
  constructor(log, api, config) {
    this.log = log;
    this.api = api;
    this.config = config;

    // 토큰 저장 위치 (Homebridge persist 폴더)
    this.tokenPath = path.join(this.api.user.persistPath(), 'smartthings_ac_token.json');
    this.tokens = null;
    this.isRefreshing = false;
    this.pendingRequests = [];

    this.client = axios.create({
      baseURL: 'https://api.smartthings.com/v1',
      timeout: 10000,
    });

    // 네트워크/429/5xx 재시도
    axiosRetry(this.client, {
      retries: 3,
      retryDelay: (n) => {
        this.log.info(`SmartThings API 재시도 (${n}회차)...`);
        return n * 1000;
      },
      retryCondition: (err) => {
        const s = err.response?.status;
        return axiosRetry.isNetworkOrIdempotentRequestError(err) || s === 429 || (s >= 500 && s < 600);
      },
    });

    this._setupInterceptors();

    // 상태 캐시 (짧게 5초)
    this.cache = new LRUCache({ max: 100, ttl: 5 * 1000 });
    this.statusPromises = new Map();
  }

  _setupInterceptors() {
    // 요청 시 토큰 주입
    this.client.interceptors.request.use(
      (cfg) => {
        if (this.tokens?.access_token) {
          cfg.headers.Authorization = `Bearer ${this.tokens.access_token}`;
        }
        return cfg;
      },
      (e) => Promise.reject(e),
    );

    // 401 응답 시 refreshToken 진행 (동시요청 큐잉)
    this.client.interceptors.response.use(
      (res) => res,
      async (error) => {
        const original = error.config;
        if (error.response?.status === 401 && !original._retry) {
          original._retry = true;

          if (!this.isRefreshing) {
            this.isRefreshing = true;
            try {
              const newAccess = await this.refreshToken();
              this.isRefreshing = false;
              this._flushWaiters(null, newAccess);
              original.headers.Authorization = `Bearer ${newAccess}`;
              return this.client(original);
            } catch (e) {
              this.isRefreshing = false;
              this._flushWaiters(e, null);
              this.log.error('토큰 갱신 실패: 재인증 필요할 수 있습니다.');
              return Promise.reject(e);
            }
          }

          // 다른 요청은 갱신 완료를 기다렸다가 재시도
          return new Promise((resolve, reject) => {
            this.pendingRequests.push({
              resolve: (newAccess) => {
                original.headers.Authorization = `Bearer ${newAccess}`;
                resolve(this.client(original));
              },
              reject,
            });
          });
        }
        return Promise.reject(error);
      },
    );
  }

  _flushWaiters(err, token) {
    for (const w of this.pendingRequests) err ? w.reject(err) : w.resolve(token);
    this.pendingRequests = [];
  }

  // --- OAuth 토큰 로드/발급/갱신 ---
  async init() {
    try {
      this.tokens = JSON.parse(await fs.readFile(this.tokenPath, 'utf8'));
      this.log.info('저장된 OAuth 토큰을 성공적으로 불러왔습니다.');
      return true;
    } catch {
      this.log.warn('저장된 토큰이 없습니다. 사용자 인증이 필요합니다.');
      return false;
    }
  }

  async getInitialTokens(code) {
    const tokenUrl = 'https://api.smartthings.com/oauth/token';
    const auth = 'Basic ' + Buffer.from(`${this.config.clientId}:${this.config.clientSecret}`).toString('base64');

    try {
      const resp = await axios.post(
        tokenUrl,
        new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: this.config.redirectUri,
          client_id: this.config.clientId,
        }),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: auth } },
      );
      await this._saveTokens(resp.data);
    } catch (e) {
      this.log.error(`초기 토큰 발급 실패: ${e.response?.status}`, e.response?.data || e.message);
      throw new Error('초기 토큰 발급 실패. 코드/리디렉트 URL을 확인하세요.');
    }
  }

  async refreshToken() {
    if (!this.tokens?.refresh_token) throw new Error('리프레시 토큰 없음');

    const tokenUrl = 'https://api.smartthings.com/oauth/token';
    const auth = 'Basic ' + Buffer.from(`${this.config.clientId}:${this.config.clientSecret}`).toString('base64');

    try {
      const resp = await axios.post(
        tokenUrl,
        new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: this.tokens.refresh_token,
        }),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: auth } },
      );
      await this._saveTokens(resp.data);
      return this.tokens.access_token;
    } catch (e) {
      this.log.error('토큰 갱신 실패:', e.message);
      throw e;
    }
  }

  async _saveTokens(tokens) {
    this.tokens = tokens;
    await fs.writeFile(this.tokenPath, JSON.stringify(tokens, null, 2), 'utf8');
    this.log.info('토큰 저장/갱신 완료');
  }

  // --- 디바이스/상태 ---
  async getDevices() {
    try {
      const res = await this.client.get('/devices');
      return res.data.items || [];
    } catch (e) {
      this.log.error('디바이스 목록 조회 오류:', e.message);
      throw e;
    }
  }

  async getStatus(deviceId) {
    const key = `status-${deviceId}`;
    const cached = this.cache.get(key);
    if (cached) return cached;

    if (this.statusPromises.has(deviceId)) return this.statusPromises.get(deviceId);

    const p = this.client
      .get(`/devices/${deviceId}/status`)
      .then((res) => {
        const data = res.data?.components?.main || {};
        this.cache.set(key, data);
        return data;
      })
      .catch((e) => {
        this.log.error(`[${deviceId}] 상태 조회 실패:`, e.message);
        throw new Error(`[${deviceId}] 상태 조회에 실패했습니다.`);
      })
      .finally(() => this.statusPromises.delete(deviceId));

    this.statusPromises.set(deviceId, p);
    return p;
  }

  async sendCommand(deviceId, command) {
    const commands = Array.isArray(command) ? command : [command];
    try {
      this.cache.delete(`status-${deviceId}`); // invalidate cache
      await this.client.post(`/devices/${deviceId}/commands`, { commands });
      this.log.info(`[명령 전송] ${deviceId} -> ${JSON.stringify(commands)}`);
    } catch (e) {
      this.log.error(`[명령 전송 실패] ${deviceId}:`, e.message);
      throw e;
    }
  }

  // --- 헬퍼: capability 값 안전 조회 ---
  async _getCap(deviceId, capability, attribute, def) {
    const s = await this.getStatus(deviceId);

    // SmartThings 응답 구조 방어: components.main["capabilityIdWithoutNamespace"] 또는 정식 키
    const shortKey = capability.split('.').pop();
    const obj = s[shortKey] || s[capability];

    const v = obj?.[attribute]?.value;
    return v == null ? def : v;
  }

  // --- Getters (index.js에서 사용하는 것만) ---
  async getPower(deviceId) {
    return (await this._getCap(deviceId, CAPABILITY.SWITCH, 'switch', 'off')) === 'on';
  }
  async getCurrentTemperature(deviceId) {
    return Number(await this._getCap(deviceId, CAPABILITY.TEMP, 'temperature', 18));
  }
  async getCoolingSetpoint(deviceId) {
    return Number(await this._getCap(deviceId, CAPABILITY.COOL_SETPOINT, 'coolingSetpoint', 18));
  }
  async getWindFree(deviceId) {
    return (await this._getCap(deviceId, CAPABILITY.OPTIONAL_MODE, 'acOptionalMode', 'off')) === 'windFree';
  }
  async getAutoClean(deviceId) {
    return (await this._getCap(deviceId, CAPABILITY.AUTO_CLEANING, 'autoCleaningMode', 'off')) === 'on';
  }

  // --- Setters (index.js에서 사용하는 것만) ---
  setPower(deviceId, on) {
    return this.sendCommand(deviceId, { component: 'main', capability: CAPABILITY.SWITCH, command: on ? 'on' : 'off' });
  }
  setMode(deviceId, mode) {
    // mode: 'dry' | 'cool'
    return this.sendCommand(deviceId, {
      component: 'main',
      capability: CAPABILITY.MODE,
      command: 'setAirConditionerMode',
      arguments: [mode],
    });
  }
  setTemperature(deviceId, value) {
    return this.sendCommand(deviceId, {
      component: 'main',
      capability: CAPABILITY.COOL_SETPOINT,
      command: 'setCoolingSetpoint',
      arguments: [value],
    });
  }
  setWindFree(deviceId, enable) {
    return this.sendCommand(deviceId, {
      component: 'main',
      capability: CAPABILITY.OPTIONAL_MODE,
      command: 'setAcOptionalMode',
      arguments: [enable ? 'windFree' : 'off'],
    });
  }
  setAutoClean(deviceId, enable) {
    return this.sendCommand(deviceId, {
      component: 'main',
      capability: CAPABILITY.AUTO_CLEANING,
      command: 'setAutoCleaningMode',
      arguments: [enable ? 'on' : 'off'],
    });
  }
}

module.exports = SmartThings;
