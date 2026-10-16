# 원격 설정: 킬스위치 · 강제 업데이트 · 점검

`app_config` 테이블(누구나 읽기, 앱에서는 쓰기 불가)을 앱이 시작할 때 읽는다(`src/lib/app-config.ts`, `AppGate`).
읽기에 실패하면 기본값으로 연다 — 설정 서버 장애가 앱 장애가 되지 않게.

| key | 값 | 효과 |
| --- | --- | --- |
| `features` | `{"chat": false, "login_google": true}` | 기능 끄기/켜기. 코드에서 `isEnabled(config, "chat")` |
| `min_version` | `{"ios": "1.3.0", "android": "1.3.0"}` | 이보다 낮은 앱은 업데이트 화면(스토어 링크) |
| `maintenance` | `{"enabled": true, "message": "10시까지 점검"}` | 점검 화면 |

바꾸는 법(사용자 또는 Claude 가 SQL 을 알려 주면 Supabase SQL Editor 에서):

```sql
update public.app_config set value = value || '{"chat": false}', updated_at = now() where key = 'features';
update public.app_config set value = '{"ios": "1.3.0", "android": "1.3.0"}', updated_at = now() where key = 'min_version';
```

앱은 **시작할 때** 읽는다 — 이미 열려 있는 앱은 다시 열 때 반영된다.

## 새 기능은 끌 수 있게

출시 후 문제가 생긴 네이티브 기능은 되돌릴 수 없다. 새 화면·결제·업로드 같은 기능은 `isEnabled(config, "<기능>")` 으로
감싸 두고, PR 의 "롤백 계획" 에 "features.<기능> = false" 를 쓴다. 기본값(설정에 키가 없을 때 켜짐/꺼짐)은 위험도에 따라 고른다.

## 최소 지원 버전 올리기

- 오래된 버전이 위험하거나(보안), contract 마이그레이션(옛 컬럼 삭제)을 하려면 올린다.
- 올리기 전에 새 버전이 스토어에서 **100% 출시**됐는지, 심사가 끝났는지 확인한다(아니면 업데이트할 버전이 없다).
- iOS 업데이트 버튼은 `src/lib/project.ts` 의 `appStoreId` 가 있어야 나온다(출시 후 App Store Connect 의 Apple ID).
