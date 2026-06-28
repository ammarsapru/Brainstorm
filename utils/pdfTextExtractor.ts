/**
 * Extract text from a PDF via LlamaParse (best quality — handles tables, columns,
 * complex .docx exports). Requires a LlamaCloud API key.
 * Uploads the file then polls until done (max ~30s).
 */
export const extractPdfTextViaLlamaParse = async (url: string, llamaKey: string): Promise<string> => {
  const fileRes = await fetch(url, { mode: 'cors' });
  if (!fileRes.ok) throw new Error(`PDF fetch failed: HTTP ${fileRes.status}`);
  const blob = await fileRes.blob();

  const form = new FormData();
  form.append('file', blob, url.split('/').pop() || 'document.pdf');
  const uploadRes = await fetch('https://api.llamaindex.ai/api/parsing/upload', {
    method: 'POST',
    headers: { Authorization: `Bearer ${llamaKey}` },
    body: form,
  });
  if (!uploadRes.ok) {
    const err = await uploadRes.json().catch(() => ({}));
    throw new Error((err as any).detail ?? `LlamaParse upload ${uploadRes.status}`);
  }
  const { id } = await uploadRes.json() as { id: string };

  // Poll for completion
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 1000));
    const statusRes = await fetch(`https://api.llamaindex.ai/api/parsing/job/${id}`, {
      headers: { Authorization: `Bearer ${llamaKey}` },
    });
    const statusData = await statusRes.json() as { status: string };
    if (statusData.status === 'SUCCESS') break;
    if (statusData.status === 'ERROR') throw new Error('LlamaParse job failed');
  }

  const mdRes = await fetch(`https://api.llamaindex.ai/api/parsing/job/${id}/result/markdown`, {
    headers: { Authorization: `Bearer ${llamaKey}` },
  });
  if (!mdRes.ok) throw new Error(`LlamaParse result fetch failed: ${mdRes.status}`);
  const { markdown } = await mdRes.json() as { markdown: string };
  return markdown ?? '';
};

/**
 * Extract plain text from a PDF using the Gemini vision API.
 * This works for complex documents (docx→pdf, multi-column, tables, scanned)
 * where raw byte extraction (pdfjs) fails to capture structure.
 *
 * Requires a Gemini API key and the PDF to be fetchable (public URL).
 */
export const extractPdfTextViaGemini = async (url: string, geminiApiKey: string): Promise<string> => {
  const res = await fetch(url, { mode: 'cors' });
  if (!res.ok) throw new Error(`PDF fetch failed: HTTP ${res.status}`);
  const buffer = await res.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  const base64 = btoa(binary);

  const body = {
    contents: [{
      parts: [
        { inline_data: { mime_type: 'application/pdf', data: base64 } },
        { text: 'Extract ALL text content from this document exactly as it appears. Include every section, heading, bullet point, table, week breakdown, and detail. Return the raw text only — no commentary, no reformatting.' },
      ],
    }],
    generationConfig: { maxOutputTokens: 8192 },
  };

  const apiRes = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
  );
  const data = await apiRes.json();
  if (!apiRes.ok) throw new Error(data.error?.message ?? `Gemini ${apiRes.status}`);
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
};
