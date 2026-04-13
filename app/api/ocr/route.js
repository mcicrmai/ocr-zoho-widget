export async function POST(req) {
  try {
    const formData = await req.formData();
    const file = formData.get("file");

    if (!file) {
      return Response.json({ error: "No file uploaded" }, { status: 400 });
    }

    // Convert file to base64
    const bytes = await file.arrayBuffer();
    const base64 = Buffer.from(bytes).toString("base64");

    // Call Google Vision API
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
    const fullText = visionData.responses?.[0]?.fullTextAnnotation?.text || "";

    console.log("📄 OCR Raw Text:", fullText);

    // Parse fields
    const result = parseWorkerDetails(fullText);
    return Response.json(result);
  } catch (err) {
    console.error("OCR Error:", err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}

function get(text, pattern) {
  return text.match(pattern)?.[1]?.trim() || null;
}

function parseWorkerDetails(text) {
  // Worker Details
  const Worker_Details = {
    Name: get(text, /Name of Worker\s*[:\-]\s*(.+)/i),
    Date_of_Birth: get(text, /DOB of Worker\s*[:\-]\s*(.+)/i),
    Nationality: get(text, /Nationality(?:\/Citizenship)?\s*[:\-]\s*(.+)/i),
    Passport_No: get(text, /Passport No\.?\s*[:\-]\s*(.+)/i),
    FIN: get(text, /Worker['']s FIN\s*[:\-]\s*(.+)/i),
    WP_No: get(text, /WP No\.?\s*[:\-]\s*(.+)/i),
    Sex: get(text, /Sex\s*[:\-]\s*(.+)/i),
  };

  // Employment History — parse table rows
  const Employment_History = [];
  const lines = text.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Match lines like: "Employer 1   14/12/2012   06/05/2013   Construction"
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
