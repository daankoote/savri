export type PlainTextMail = Readonly<{
  sender: string;
  senderName: string;
  recipient: string;
  subject: string;
  body: string;
}>;

export type LocalSmtpResult = Readonly<{
  accepted: boolean;
  safeFailureCode?:
    | "transport_unavailable"
    | "delivery_failed"
    | "delivery_ambiguous";
}>;

function safeHeader(value: string): boolean {
  return value.length > 0 && value.length <= 320 && !/[\r\n]/u.test(value);
}

async function readReply(connection: Deno.Conn): Promise<number> {
  const buffer = new Uint8Array(2048);
  let text = "";
  for (let reads = 0; reads < 8; reads += 1) {
    const count = await connection.read(buffer);
    if (count === null) break;
    text += new TextDecoder().decode(buffer.subarray(0, count));
    const last = text.split("\r\n").filter(Boolean).at(-1) || "";
    if (/^\d{3} /u.test(last)) return Number(last.slice(0, 3));
  }
  return 0;
}

async function command(
  connection: Deno.Conn,
  value: string,
  expected: readonly number[],
): Promise<void> {
  await connection.write(new TextEncoder().encode(`${value}\r\n`));
  if (!expected.includes(await readReply(connection))) {
    throw new Error("smtp_delivery_failed");
  }
}

export async function sendLocalPlainTextMail(
  host: string,
  port: number,
  mail: PlainTextMail,
): Promise<LocalSmtpResult> {
  if (
    !safeHeader(mail.sender) || !safeHeader(mail.senderName) ||
    !safeHeader(mail.recipient) || !safeHeader(mail.subject) ||
    !Number.isInteger(port) || port < 1 || port > 65535
  ) return { accepted: false, safeFailureCode: "delivery_failed" };

  let connection: Deno.Conn | null = null;
  let messageTransmissionStarted = false;
  try {
    connection = await Deno.connect({ hostname: host, port });
    if (await readReply(connection) !== 220) {
      throw new Error("smtp_unavailable");
    }
    await command(connection, "EHLO enval.local", [250]);
    await command(connection, `MAIL FROM:<${mail.sender}>`, [250]);
    await command(connection, `RCPT TO:<${mail.recipient}>`, [250, 251]);
    await command(connection, "DATA", [354]);
    const normalizedBody = mail.body.replaceAll("\r\n", "\n").replaceAll(
      "\n",
      "\r\n",
    );
    const message = [
      `From: ${mail.senderName} <${mail.sender}>`,
      `To: ${mail.recipient}`,
      `Subject: ${mail.subject}`,
      "Content-Type: text/plain; charset=UTF-8",
      "",
      normalizedBody,
    ].join("\r\n").replaceAll("\r\n.", "\r\n..");
    messageTransmissionStarted = true;
    await command(connection, `${message}\r\n.`, [250]);
    try {
      await command(connection, "QUIT", [221]);
    } catch (_error) {
      // DATA acceptance is the SMTP commit point. QUIT is best effort only.
    }
    return { accepted: true };
  } catch (_error) {
    return {
      accepted: false,
      safeFailureCode: messageTransmissionStarted
        ? "delivery_ambiguous"
        : connection
        ? "delivery_failed"
        : "transport_unavailable",
    };
  } finally {
    try {
      connection?.close();
    } catch (_error) {
      // Connection cleanup is best effort after a classified transport result.
    }
  }
}
