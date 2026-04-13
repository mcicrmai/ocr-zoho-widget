export async function POST(req) {
  try {
    const formData = await req.formData();
    const file = formData.get("file");

    if (!file) {
      return Response.json({ error: "No file uploaded" }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const base64 = Buffer.from(bytes).toString("base64");

    // Check API key
    if (!process.env.GOOGLE_VISION_API_KEY) {
      return Response.json(
        { error: "GOOGLE_VISION_API_KEY not set" },
        { status: 500 },
      );
    }

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

    // Debug — visible in Vercel logs
    console.log(
      "VISION RESPONSE:",
      JSON.stringify(visionData?.responses?.[0]?.error || "OK"),
    );

    const fullText = visionData.responses?.[0]?.fullTextAnnotation?.text || "";

    // Debug — visible in Vercel logs
    console.log("RAW OCR TEXT:\n", fullText);

    if (!fullText) {
      return Response.json({
        error: "No text extracted",
        vision_error: visionData.responses?.[0]?.error || null,
        Worker_Details: {
          Name: null,
          Date_of_Birth: null,
          Nationality: null,
          Passport_No: null,
          FIN: null,
          WP_No: null,
          Sex: null,
        },
        Employment_History: [],
      });
    }

    const result = parseWorkerDetails(fullText);

    // Debug — visible in Vercel logs
    console.log("PARSED RESULT:", JSON.stringify(result));

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
  // Normalize text — remove extra spaces
  const normalized = text.replace(/\r/g, "").replace(/[ \t]+/g, " ");

  console.log("NORMALIZED TEXT:\n", normalized);

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
      get(normalized, /Nationality\s*[:\-]\s*(.+)/i) ||
      get(normalized, /Citizenship\s*[:\-]\s*(.+)/i),
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

  // Parse Employment History
  const Employment_History = [];
  const lines = normalized.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Pattern: "Employer 1   19/11/2025   24/11/2025   Construction"
    const match = line.match(
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
