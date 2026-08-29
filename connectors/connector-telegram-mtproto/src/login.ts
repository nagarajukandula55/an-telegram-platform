import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";

/**
 * Stateful helper for the interactive MTProto login flow: phone number ->
 * SMS/app code -> optional 2FA password -> a persistable session string.
 *
 * Usage from apps/api (ConnectorsService):
 *   const login = new MtprotoLoginSession(apiId, apiHash);
 *   const { phoneCodeHash } = await login.sendCode(phoneNumber);
 *   // ...user submits the code they received...
 *   const result = await login.submitCode(code);
 *   if (result.status === "needs_password") {
 *     const result2 = await login.submitPassword(password);
 *     // result2.sessionString -> encryptSecret() -> Connector.config
 *   } else {
 *     // result.sessionString -> encryptSecret() -> Connector.config
 *   }
 *
 * One instance handles exactly one in-progress login and holds a live
 * MTProto connection for the duration — the API layer should keep it
 * in-memory (keyed by a short-lived login attempt id) and dispose it after
 * the flow completes or times out.
 */
export class MtprotoLoginSession {
  private client: TelegramClient;
  private phoneNumber = "";
  private phoneCodeHash = "";

  constructor(
    private readonly apiId: number,
    private readonly apiHash: string,
  ) {
    this.client = new TelegramClient(new StringSession(""), apiId, apiHash, { connectionRetries: 3 });
  }

  async sendCode(phoneNumber: string): Promise<{ phoneCodeHash: string }> {
    this.phoneNumber = phoneNumber;
    await this.client.connect();
    const result = await this.client.sendCode(
      { apiId: this.apiId, apiHash: this.apiHash },
      phoneNumber,
    );
    this.phoneCodeHash = result.phoneCodeHash;
    return { phoneCodeHash: result.phoneCodeHash };
  }

  async submitCode(
    code: string,
  ): Promise<{ status: "logged_in"; sessionString: string } | { status: "needs_password" }> {
    try {
      await this.client.invoke(
        new (await import("telegram/tl")).Api.auth.SignIn({
          phoneNumber: this.phoneNumber,
          phoneCodeHash: this.phoneCodeHash,
          phoneCode: code,
        }),
      );
      return { status: "logged_in", sessionString: this.client.session.save() as unknown as string };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes("SESSION_PASSWORD_NEEDED")) {
        return { status: "needs_password" };
      }
      throw err;
    }
  }

  async submitPassword(password: string): Promise<{ status: "logged_in"; sessionString: string }> {
    const { computeCheck } = await import("telegram/Password");
    const { Api } = await import("telegram/tl");
    const passwordInfo = await this.client.invoke(new Api.account.GetPassword());
    const passwordSrp = await computeCheck(passwordInfo, password);
    await this.client.invoke(new Api.auth.CheckPassword({ password: passwordSrp }));
    return { status: "logged_in", sessionString: this.client.session.save() as unknown as string };
  }

  async dispose(): Promise<void> {
    await this.client.disconnect();
  }
}
