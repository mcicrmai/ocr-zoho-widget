export async function POST(req) {
  try {
    const formData = await req.formData();
    const file = formData.get("file");

    if (!file) {
      return Response.json({ error: "No file uploaded" }, { status: 400 });
    }

    // Debug file info
    console.log("FILE NAME:", file.name);
    console.log("FILE TYPE:", file.type);
    console.log("FILE SIZE:", file.size, "bytes");

    const bytes = await file.arrayBuffer();
    const base64 = Buffer.from(bytes).toString("base64");

    console.log("BASE64 LENGTH:", base64.length);
    console.log("BASE64 PREVIEW:", base64.substring(0, 100));

    if (!process.env.GOOGLE_VISION_API_KEY) {
      return Response.json(
        { error: "GOOGLE_VISION_API_KEY not set" },
        { status: 500 },
      );
    }

    console.log("API KEY EXISTS:", !!process.env.GOOGLE_VISION_API_KEY);
    console.log("API KEY LENGTH:", process.env.GOOGLE_VISION_API_KEY?.length);

    const visionRes = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${process.env.GOOGLE_VISION_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requests: [
            {
              image: { content: base64 },
              features: [{ type: "DOCUMENT_TEXT_DETECTION" }],
            },
          ],
        }),
      },
    );

    const visionData = await visionRes.json();

    // Full vision response
    console.log("FULL VISION RESPONSE:", JSON.stringify(visionData));

    const fullText = visionData.responses?.[0]?.fullTextAnnotation?.text || "";
    console.log("RAW OCR TEXT:", fullText);

    if (!fullText) {
      return Response.json({
        error: "No text extracted",
        debug: {
          file_name: file.name,
          file_size: file.size,
          file_type: file.type,
          base64_length: base64.length,
          vision_response: visionData,
        },
      });
    }

    const result = parseWorkerDetails(fullText);
    return Response.json(result);
  } catch (err) {
    console.error("OCR Error:", err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}

function get(text, pattern) {
  const match = text.match(pattern);
  return match?.[1]?.trim() || null;
}

function parseWorkerDetails(text) {
  const normalized = text.replace(/\r/g, "").replace(/[ \t]+/g, " ");

  const Worker_Details = {
    Name:
      get(normalized, /Name of Worker\s*[:\-]\s*(.+)/i) ||
      get(normalized, /Worker Name\s*[:\-]\s*(.+)/i) ||
      get(normalized, /Name\s*[:\-]\s*(.+)/i),
    Date_of_Birth:
      get(normalized, /DOB of Worker\s*[:\-]\s*(.+)/i) ||
      get(normalized, /Date of Birth\s*[:\-]\s*(.+)/i) ||
      get(normalized, /DOB\s*[:\-]\s*(.+)/i),
    Nationality:
      get(normalized, /Nationality\/Citizenship\s*[:\-]\s*(.+)/i) ||
      get(normalized, /Nationality\s*[:\-]\s*(.+)/i),
    Passport_No:
      get(normalized, /Passport No\.?\s*[:\-]\s*(.+)/i) ||
      get(normalized, /Passport\s*[:\-]\s*(.+)/i),
    FIN:
      get(normalized, /Worker[''\u2019s]*s?\s*FIN\s*[:\-]\s*(.+)/i) ||
      get(normalized, /FIN\s*[:\-]\s*(.+)/i),
    WP_No:
      get(normalized, /WP No\.?\s*[:\-]\s*(.+)/i) ||
      get(normalized, /Work Permit\s*[:\-]\s*(.+)/i),
    Sex:
      get(normalized, /Sex\s*[:\-]\s*(.+)/i) ||
      get(normalized, /Gender\s*[:\-]\s*(.+)/i),
  };

  const Employment_History = [];
  const lines = normalized.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i]
      .trim()
      .match(
        /^(Employer\s*\d+)\s+(\d{2}\/\d{2}\/\d{4})\s+(\d{2}\/\d{2}\/\d{4})\s+(.+)$/i,
      );
    if (match) {
      Employment_History.push({
        Employer: match[1].trim(),
        Start_Date: match[2].trim(),
        End_Date: match[3].trim(),
        Industry: match[4].trim(),
      });
    }
  }

  return { Worker_Details, Employment_History };
}
