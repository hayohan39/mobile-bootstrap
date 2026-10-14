# 수익화: 인앱결제·구독·광고·외부 결제

먼저 **무엇을 파는지**로 결제 수단이 정해진다(스토어 정책).

| 파는 것 | 결제 | 예 |
| --- | --- | --- |
| 앱 안에서 쓰는 디지털 상품·기능·구독 | **스토어 인앱결제(IAP) 필수** | 프리미엄 단어장, 광고 제거, 게임 아이템, 구독 |
| 실물·오프라인 서비스 | 외부 결제(PG) 가능, IAP 쓰면 안 됨 | 중고 거래 대금, 숙박·공연 예약 |
| 사용자 간 송금 | 외부 결제 + 금융 규제 검토 | 당근페이류 — 템플릿 범위 밖, 전문가 |

한국: 전기통신사업법 개정으로 대체 결제가 허용되지만(Apple 은 별도 권한·국내 전용 빌드, Google 은 대체 결제 API),
수수료 차이가 크지 않고 구현·신청이 늘어난다. **처음에는 IAP 만** 쓰고, 매출이 생기면 검토한다(decisions.md).

## 구독·인앱결제: RevenueCat (1순위)

- 영수증 검증·구독 상태·환불·플랫폼 차이를 서버에서 처리해 준다. 무료 구간이 있다(월 추적 매출 기준 — 가입 때 확인).
- 대안: `expo-iap`(직접 영수증 검증 서버를 만들어야 함).

순서 (사용자가 할 일 ☐, Claude 🤖)
1. ☐ 스토어 콘솔에서 상품/구독 등록(App Store Connect → 구독, Play Console → 수익 창출 제품). 유료 앱 계약·세금·계좌.
2. ☐ RevenueCat 가입 → 앱 등록(번들 id) → 스토어 연결(ASC API 키 / Play 서비스 계정) → Entitlement·Offering.
3. 🤖 네이티브 PR: `npx expo install react-native-purchases`(+ 필요하면 `react-native-purchases-ui`) — 새 빌드.
4. 🤖 기능 PR: `src/lib/purchases.ts` 에서 `Purchases.configure({ apiKey })`(플랫폼별 **공개** SDK 키 → `EXPO_PUBLIC_REVENUECAT_*`,
   `env.ts` 에 추가), 로그인 사용자의 Supabase id 로 `logIn`, 결제 화면, "구매 복원" 버튼(심사 필수).
5. 🤖 서버 권한: 프리미엄 여부를 앱이 정하게 두지 않는다. RevenueCat 웹훅 → Edge Function(서명 검증) → `entitlements` 테이블 →
   RLS 가 프리미엄 데이터를 막는다.
6. 테스트: 샌드박스 계정(iOS)·라이선스 테스터(Android). 웹에서는 결제 대신 안내를 보이게(`*.web.tsx`).

## 광고: AdMob

- 🤖 `npx expo install react-native-google-mobile-ads` + `app.json` 플러그인(AdMob 앱 id) — 새 빌드.
- **동의**: EU 등은 UMP(Google 동의 관리), iOS 는 ATT(추적 허용 요청, `NSUserTrackingUsageDescription` 한국어 문구).
  동의 전에는 맞춤 광고를 요청하지 않는다. 개인정보 라벨/Data safety 에 광고 데이터 항목 추가.
- 어린이 대상 앱이면 광고 규정이 훨씬 엄격하다 — 먼저 묻는다.
- 개발 중에는 테스트 광고 단위 id 만 쓴다(실제 광고를 자기가 누르면 계정 정지).

## 외부 결제 (예약·거래)

PG(토스페이먼츠, 포트원 등)는 계약·사업자가 필요하다 — 사용자 결정. 결제 승인은 반드시 서버(Edge Function)에서 하고
금액은 서버가 DB 에서 다시 계산한다(앱이 보낸 금액을 믿지 않는다). 웹훅 서명 검증, 멱등 키.

## Risk 메모

결제 코드는 보통 `security.auth-code`·`compat` 신호가 붙고 HIGH 다. PR 본문 "롤백 계획" 에 킬스위치(`app_config`)로
결제 화면을 끄는 방법을 쓴다.
