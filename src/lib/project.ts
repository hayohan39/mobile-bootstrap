// new-project 가 채운다. 앱 화면 이름(표시명)은 app.json 의 expo.name 이다.
export const PROJECT = {
  name: "{{PROJECT_NAME}}",
  description: "{{PROJECT_DESCRIPTION}}",
  // 운영자 문의 이메일. 개인정보처리방침·이용약관·스토어(Apple 1.2 의 운영자 연락처)에 쓰인다 — 출시 전에 채운다.
  supportEmail: "",
  // App Store 의 앱 숫자 id(출시 후). 강제 업데이트 화면의 "업데이트" 버튼이 이 주소로 간다.
  appStoreId: "",
} as const;
