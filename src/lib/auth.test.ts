import { authErrorMessage, isValidEmail } from "@/lib/auth";

describe("auth 도우미", () => {
  it("이메일 형식", () => {
    expect(isValidEmail(" me@example.com ")).toBe(true);
    expect(isValidEmail("me@example")).toBe(false);
    expect(isValidEmail("")).toBe(false);
  });

  it("오류 문구는 내부 메시지를 노출하지 않는다", () => {
    expect(authErrorMessage(new Error("Email rate limit exceeded"))).toContain("너무 많습니다");
    expect(authErrorMessage(new Error("Token has expired or is invalid"))).toContain("만료");
    expect(authErrorMessage(new Error("canceled"))).toBe("");
    expect(authErrorMessage(new Error("relation auth.users does not exist"))).not.toContain("auth.users");
  });
});
