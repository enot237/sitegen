const form = document.getElementById("generate-form");
const statusEl = document.getElementById("status");

const setStatus = (message, isError = false) => {
  statusEl.textContent = message;
  statusEl.style.color = isError ? "#b42318" : "";
};

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const formData = new FormData(form);
  const clientId = String(formData.get("clientId") || "").trim();
  const prompt = String(formData.get("prompt") || "").trim();

  if (!clientId || !prompt) {
    setStatus("Нужно заполнить оба поля.", true);
    return;
  }

  const button = form.querySelector("button[type='submit']");
  button.disabled = true;
  setStatus("Генерируем сайт и загружаем в S3...");

  try {
    const response = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, prompt })
    });

    const contentType = response.headers.get("content-type") || "";
    const rawText = await response.text();
    const data = contentType.includes("application/json")
      ? JSON.parse(rawText || "{}")
      : { error: rawText || "Unexpected response from server." };

    if (!response.ok) {
      const suffix = data.requestId ? ` (requestId: ${data.requestId})` : "";
      throw new Error((data.error || "Не удалось сгенерировать сайт.") + suffix);
    }

    const lines = [
      "Готово!",
      data.buildUrl ? `Build URL: ${data.buildUrl}` : null,
      data.buildPrefix ? `Build: ${data.buildPrefix}` : null,
      data.srcPrefix ? `Src: ${data.srcPrefix}` : null,
      data.s3Build ? `S3 build: ${data.s3Build}` : null,
      data.s3Src ? `S3 src: ${data.s3Src}` : null,
      data.url ? `URL: ${data.url}` : null,
      data.s3Uri ? `S3: ${data.s3Uri}` : null,
      data.key ? `Путь: ${data.key}` : null
    ].filter(Boolean);

    setStatus(lines.join("\n"));
  } catch (error) {
    setStatus(error.message, true);
  } finally {
    button.disabled = false;
  }
});
