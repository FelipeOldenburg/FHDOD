import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";

let hidden = false;
const output = new Writable({
  write(chunk, encoding, callback) {
    if (!hidden) process.stdout.write(chunk, encoding);
    callback();
  },
});
const prompt = createInterface({ input: process.stdin, output, terminal: !!process.stdin.isTTY });
prompt.on("SIGINT", () => { prompt.close(); process.exitCode = 1; });

try {
  const name = await prompt.question("Nome do Super Admin: ");
  const email = await prompt.question("E-mail: ");
  process.stdout.write("Senha (12 a 128 caracteres; não será exibida): ");
  hidden = true;
  const password = await prompt.question("");
  hidden = false;
  process.stdout.write("\n");
  const response = await fetch(`http://127.0.0.1:${process.env.PORT || 3001}/api/auth/setup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, email, password }),
    signal: AbortSignal.timeout(20000),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Não foi possível configurar o Super Admin.");
  console.log("Super Admin criado. Entre pelo navegador com o e-mail e a senha informados.");
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  prompt.close();
}
