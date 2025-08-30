# Homebridge SmartThings AC (KM81)

삼성 시스템 에어컨을 SmartThings API를 통해 HomeKit에 연동하기 위한 Homebridge 플러그인입니다. 이 플러그인은 HomeKit 환경에서 에어컨을 더 단순하고 직관적으로 사용하고자 하는 목적에 맞춰져 있으며, 특히 **냉방/제습 위주의 사용**에 최적화되어 있습니다.

---

## 주요 기능

- **HomeKit을 통한 삼성 시스템 에어컨 제어**: 전원, 온도 설정 등 기본 제어가 가능합니다.  
- **단순화된 제어 모드**: HomeKit UI의 복잡성을 줄이기 위해 제어 모드를 **‘냉방’과 ‘끔’**으로 제한했습니다. ‘난방’ 및 ‘자동’ 모드는 UI에 표시되지 않습니다.  
- **제습 모드 연동**: HomeKit에서 ‘냉방’ 모드를 선택하면 실제 에어컨은 기본적으로 **‘제습(Dry)’ 모드로 동작**합니다. (설정에서 ‘냉방(Cool)’로 전송하도록 변경 가능)  
- **통합된 ‘냉방 중’ 상태**: 에어컨의 실제 동작 모드(냉방/제습/송풍 등)와 관계없이 **전원이 켜져 있으면 HomeKit에서는 항상 ‘냉방 중’**으로 상태가 표시됩니다.  
- **부가 기능 지원**  
  - **무풍 모드**: HomeKit의 ‘스윙’ 토글로 켜고 끌 수 있습니다.  
  - **자동건조 모드**: HomeKit의 ‘물리 제어 잠금’(Lock) 토글로 켜고 끌 수 있습니다.  

---

## 🆕 이번 업데이트로 추가된 기능(홈브릿지 UI에서 설정 가능)

1. **HomeKit ‘냉방(COOL)’ 전송 모드 선택**  
   - `제습(Dry)로 명령`(기본) / `냉방(Cool)로 명령` 중 택1.  
   - 이 선택은 **Home에서 ‘냉방’을 누를 때 SmartThings로 어떤 모드를 보낼지**를 결정합니다.  
     (표시 로직은 그대로: 전원이 켜져 있으면 HomeKit 상태는 ‘냉방 중’)

2. **스윙(Swing) 토글 ↔ 기능 매핑**  
   - `무풍(WindFree)` / `사용 안 함` 중 택1.  


3. **어린이 보호용 잠금장치(Lock) 토글 ↔ 기능 매핑**  
   - `자동건조(Auto Clean)` / `사용 안 함` 중 택1.  


4. **별도 스위치 노출(선택)**  
   - `무풍 별도 스위치 노출`, `자동건조 별도 스위치 노출` 체크 시 **개별 Switch 액세서리**가 생성됩니다.

5. ### 플랫폼 기본값(모든 장치 공통 기본)
    - `기본 목표온도 최소값(℃)` (`temperatureMin`) — 기본 `18`  
    - `기본 목표온도 최대값(℃)` (`temperatureMax`) — 기본 `30`  
    - `기본 목표온도 스텝(℃)` (`temperatureStep`) — 기본 `1`

   ### 장치별 오버라이드(해당 장치에만 적용)
    - `목표온도 최소값(℃) *개별 장치` (`devices[].temperatureMin`)
    - `목표온도 최대값(℃) *개별 장치` (`devices[].temperatureMax`)
    - `목표온도 스텝(℃) *개별 장치` (`devices[].temperatureStep`)
    > 장치 카드에 값을 입력하면 **플랫폼 기본값을 덮어쓰고** 그 장치에만 적용됩니다.

> 매칭 기준: SmartThings의 **장치 레이블(deviceLabel)**. 한국어 정규화(NFC) 처리는 해주지만, **띄어쓰기/철자**는 정확히 일치해야 합니다.

---
## 사전 준비

1.  [Homebridge](https://homebridge.io/)가 설치되어 있어야 합니다. (Homebridge UI 사용을 권장합니다.)
2.  **Node.js 18.0.0 이상** 버전이 필요합니다.
3.  SmartThings 계정이 있어야 하며, 제어하려는 에어컨이 SmartThings 앱에 정상적으로 등록되어 있어야 합니다.
---
## 설치

Homebridge UI의 '플러그인' 탭에서 `homebridge-smartthings-ac-km81`을 검색하여 설치하거나, 터미널에서 아래 명령어를 직접 실행합니다.

```sh
npm install -g homebridge-smartthings-ac-km81
```

***
---
## 설정 (리버스 프록시 필수)

SmartThings의 보안 정책 변경으로 인해, 이제 **`https` 프로토콜을 사용하는 주소만** 인증을 위한 Redirect URI로 등록할 수 있습니다. 따라서 외부에서 `https`로 접속할 수 있는 환경을 만들고, 이를 내부 Homebridge의 `http` 주소로 전달해주는 **리버스 프록시(Reverse Proxy)** 설정이 **필수**입니다.
---
### 1단계: 리버스 프록시 설정 및 HTTPS 주소 준비

가장 먼저 외부에서 접속 가능한 `https` 주소를 준비해야 합니다. Synology NAS, Nginx Proxy Manager 등 다양한 도구를 사용할 수 있습니다.

#### 리버스 프록시 개념

* **외부 주소 (SmartThings 등록용, `https`):** `https://<나의도메인>:<외부포트>`
* **내부 주소 (플러그인 리스닝용, `http`):** `http://<홈브릿지IP>:8999`

이 플러그인은 내부적으로 **항상 8999 포트**에서 인증 요청을 기다립니다. 따라서 리버스 프록시의 목적지 포트는 **반드시 `8999`로 지정**해야 합니다.

#### 설정 예시 (Synology NAS 기준)

1.  Synology 제어판 > 로그인 포털 > 고급 > **리버스 프록시**로 이동하여 `생성`을 클릭합니다.
2.  **리버스 프록시 규칙 설정:**
    * **소스 (Source):**
        * 프로토콜: `HTTPS`
        * 호스트 이름: 나의 DDNS 주소 (예: `myhome.myds.me`)
        * 포트: 외부에서 사용할 포트 (예: `9002`)
    * **대상 (Destination):**
        * 프로토콜: `HTTP`
        * 호스트 이름: Homebridge가 설치된 기기의 내부 IP 주소 (예: `192.168.1.10`)
        * 포트: **`8999` (고정)**
3.  설정을 저장합니다.
4.  이제 외부 주소인 **`https://myhome.myds.me:9002`** 를 다음 단계에서 사용합니다.
   
---
### 2단계: SmartThings API Key 발급 (CLI 방식)

1.  **SmartThings CLI 설치**
    터미널 앱을 열고 아래 명령어를 실행합니다.

    ```sh
    npm install -g @smartthings/cli
    ```

2.  **개인용 액세스 토큰(PAT) 발급**
    * [SmartThings 개인용 액세스 토큰 페이지](https://account.smartthings.com/tokens)에 접속합니다.
    * **'Generate new token'**을 클릭하고, 모든 권한을 체크한 후 토큰을 생성하고 값을 복사합니다.

3.  **터미널에서 CLI 인증**
    아래 명령어를 실행하여 발급받은 PAT를 환경 변수로 등록합니다.

    ```sh
    # "YOUR_PAT_TOKEN" 부분을 위에서 복사한 토큰 값으로 변경하세요.
    export SMARTTHINGS_TOKEN="YOUR_PAT_TOKEN"
    ```

4.  **OAuth App 생성 및 Client ID/Secret 발급**
    아래 명령어를 터미널에 입력합니다.

    ```sh
    smartthings apps:create
    ```

    명령어 실행 후 나타나는 질문에 아래 예시를 참고하여 입력하세요.
    * `Display Name`: `Homebridge AC Control`
    * `Description`: `Homebridge AC Control`
    * `Icon Image URL` / `Target URL`: 그냥 엔터를 눌러 넘어갑니다.
    * `Select Scopes`: 스페이스바를 눌러 아래 3가지 권한을 **모두 선택**하고 엔터를 누릅니다.
        * `r:devices:*`
        * `w:devices:*`
        * `x:devices:*`
    * `Add or edit Redirect URIs`: **'Add Redirect URI'** 를 선택합니다.
    * `Redirect URI`: **1단계에서 준비한 리버스 프록시의 외부 `https` 주소를 입력합니다.**
        * **예시: `https://myhome.myds.me:9002`**
        * 이후 `config.json`에 입력할 `redirectUri` 값과 **정확히 일치해야 합니다.**
    * `Add or edit Redirect URIs`: **'Finish editing Redirect URIs'** 를 선택합니다.
    * `Choose an action`: **'Finish and create OAuth-In SmartApp'** 을 선택합니다.

5.  **결과 확인 및 정보 저장**
    모든 절차가 완료되면 터미널에 `OAuth Client Id`와 `OAuth Client Secret` 값이 출력됩니다. 이 정보는 다시 확인할 수 없으므로 **반드시 지금 복사하여 저장**해야 합니다.

---
### 3단계: Homebridge `config.json` 설정

Homebridge UI로 입력하거나 `config.json`에 직접 추가:

```json
{
  "platform": "SmartThingsAC-KM81",
  "name": "SmartThings AC",
  "clientId": "YOUR_CLIENT_ID",
  "clientSecret": "YOUR_CLIENT_SECRET",
  "redirectUri": "https://myhome.myds.me:9002",
  "devices": [
    {
      "deviceLabel": "거실 에어컨",
      "model": "AW06C7155WWA",
      "serialNumber": "OLC5PDOY601505H",
      "coolModeCommand": "dry",
      "swingBinding": "windFree",
      "lockBinding": "autoClean",
      "exposeWindFreeSwitch": false,
      "exposeAutoCleanSwitch": false
    },
    {
      "deviceLabel": "안방 에어컨",
      "coolModeCommand": "cool",
      "swingBinding": "none",
      "lockBinding": "autoClean",
      "exposeWindFreeSwitch": true,
      "exposeAutoCleanSwitch": true
    }
  ]
}
```

- `platform`: **SmartThingsAC-KM81**  
- `redirectUri`: 리버스 프록시 외부 **HTTPS** 주소와 정확히 동일해야 함  
- `deviceLabel`: SmartThings 앱의 레이블과 **완전 일치**(띄어쓰기/대소문자 포함)


## 설정 (Homebridge UI에서 빠르게)

1. 플러그인 설정 → `Client ID`, `Client Secret`, `Redirect URI(https)` 입력  
2. **에어컨 목록** → `ADD 에어컨 목록` → 장치 카드 1개 생성  
3. 카드 안에서 입력
   - **에어컨 이름(SmartThings 레이블)** *(필수)*
   - **모델명 / 일련번호** *(선택)*
   - **HomeKit ‘냉방(COOL)’ 전송 모드**: `제습(Dry)` 또는 `냉방(Cool)`
   - **스윙 토글 ↔ 기능**: `무풍(WindFree)` 또는 `사용 안 함)`
   - **어린이 보호용 잠금장치 토글 ↔ 기능**: `자동건조(Auto Clean)` 또는 `사용 안 함`
   - **무풍/자동건조 별도 스위치 노출** *(필요 시 체크)*
4. 저장 후 Homebridge 재시작 → 반영된 액세서리가 생성

> **팁**  
> - 카드 우상단 **X 하나**만 보여야 정상(장치 한 대 삭제).  
> - 드롭다운은 기본값이 들어가 **‘None’ 없음**.  
> - 저장 후 `config.json`의 `devices`에 **입력 값이 그대로 기록**되어야 합니다.

---
### 4단계: 플러그인 최초 인증

1.  설정 저장이 완료되면 Homebridge를 **재시작**합니다.
2.  Homebridge 로그(Log)를 확인하면, **`[스마트싱스 인증 필요]`** 라는 문구와 함께 인증 URL이 나타납니다.
3.  로그에 표시된 `인증 URL` 전체를 복사하여 웹 브라우저 주소창에 붙여넣고 접속합니다.
4.  SmartThings 계정으로 로그인하고, 생성한 앱에 대한 권한을 **'허용(Authorize)'** 합니다.
5.  "인증 성공!" 메시지가 브라우저에 표시되면 정상적으로 완료된 것입니다.
6.  다시 Homebridge를 **재시작**하면 플러그인이 에어컨 장치를 인식하고 HomeKit에 추가합니다.


## 상세 기능 설명

| HomeKit 기능 | 실제 에어컨 동작 | 비고 |
| --- | --- | --- |
| **상태(State)** | 꺼짐: `비활성(Inactive)`<br>켜짐: `냉방 중(Cooling)` | 전원이 켜져 있으면 실제 모드와 관계없이 항상 ‘냉방 중’으로 표시 |
| **모드(Mode)** | UI에 ‘냉방(Cool)’만 표시<br>‘냉방’ 선택 시 `제습(Dry)` 또는 `냉방(Cool)`(설정값)으로 전송 | **전송 모드 선택** 옵션 추가 |
| **온도 설정(Temp)** | 희망 온도(18–30℃) 설정 | 일반 제어와 동일 |
| **스윙(Swing)** | On: `무풍(WindFree)` 켜짐<br>Off: `무풍(WindFree)` 꺼짐 | 매핑을 ‘사용 안 함’으로 두면 스윙 특성 숨김 |
| **물리 제어 잠금(Lock)** | On: `자동건조(Auto Clean)` 켜짐<br>Off: `자동건조(Auto Clean)` 꺼짐 | 명칭을 ‘어린이 보호용 잠금장치’로 표기. ‘사용 안 함’이면 특성 숨김 |
| **별도 스위치(Switch)** | `무풍`, `자동건조`를 개별 스위치로 제어 | 설정에서 각각의 노출 옵션을 켜면 생성 |

---
## 문제 해결 (Troubleshooting)

* **"장치를 찾지 못했습니다" 로그가 표시될 경우:**
    * `config.json`의 `deviceLabel`이 SmartThings 앱의 장치 이름과 **완전히 동일한지** 확인하세요. (띄어쓰기 포함)
    * SmartThings 앱 생성 시 **'devices' 관련 권한 3가지**(`r:devices:*`, `w:devices:*`, `x:devices:*`)를 모두 체크했는지 확인하세요.
* **인증이 실패하거나 "invalid\_grant" 오류가 발생할 경우:**
    * `config.json`의 `clientId`, `clientSecret`, `redirectUri` 값이 올바르게 입력되었는지 다시 한번 확인하세요.
    * Homebridge 서버가 실행 중인 기기의 방화벽이 `8999` 포트를 차단하고 있지 않은지, 그리고 **리버스 프록시 설정이 올바른지** 확인하세요.
 
---
## 부록: 설정 항목 요약

| 키 | 값 | 기본값 | 설명 |
| --- | --- | --- | --- |
| `deviceLabel` | 문자열 | (필수) | SmartThings 레이블과 동일해야 매칭 |
| `model` | 문자열 | `""` | 표시용(선택) |
| `serialNumber` | 문자열 | `""` | 표시용(선택) |
| `coolModeCommand` | `dry` / `cool` | `dry` | Home에서 ‘냉방’ 선택 시 ST에 보낼 명령 |
| `swingBinding` | `windFree` / `none` | `windFree` | 스윙 ↔ 무풍 매핑 또는 숨김 |
| `lockBinding` | `autoClean` / `none` | `autoClean` | 잠금 ↔ 자동건조 매핑 또는 숨김 |
| `exposeWindFreeSwitch` | `true/false` | `false` | 무풍 별도 스위치 생성 |
| `exposeAutoCleanSwitch` | `true/false` | `false` | 자동건조 별도 스위치 생성 |






