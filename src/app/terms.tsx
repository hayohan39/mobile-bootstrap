import { Policy } from "@/components/policy";
import { PROJECT } from "@/lib/project";

// 이용약관 기본안. 유료 상품·사용자 콘텐츠·위치 기능을 추가하면 해당 조항을 더한다(docs/recipes/).
export default function Terms() {
  return (
    <Policy
      testID="terms-title"
      title="이용약관"
      intro={`이 약관은 ${PROJECT.name}(이하 "서비스")의 이용 조건과 절차를 정합니다.`}
      sections={[
        { title: "1. 계정", body: ["이용자는 자신의 계정을 직접 관리하며, 언제든 앱의 설정에서 계정을 삭제할 수 있습니다."] },
        {
          title: "2. 금지 행위",
          body: ["다른 사람의 정보를 도용하거나, 서비스의 정상적인 운영을 방해하거나, 법령에 어긋나는 콘텐츠를 올리는 행위를 금지합니다."],
        },
        {
          title: "3. 서비스의 변경과 중단",
          body: ["서비스는 기능 개선을 위해 내용을 바꿀 수 있으며, 점검·장애 시 일시적으로 중단될 수 있습니다. 중요한 변경은 미리 알립니다."],
        },
        { title: "4. 책임의 제한", body: ["서비스는 천재지변 등 불가항력이나 이용자의 귀책으로 생긴 손해에 대해 책임지지 않습니다."] },
        { title: "5. 문의", body: [PROJECT.supportEmail ? `문의: ${PROJECT.supportEmail}` : "문의는 앱 설정 화면의 문의처로 해 주세요."] },
      ]}
    />
  );
}
