// CORS headers — allow Zoho widget origin
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// Handle preflight OPTIONS request
export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export async function POST(req) {
  try {
    const formData = await req.formData();
    const file = formData.get("file");

    if (!file) {
      return Response.json(
        { error: "No file uploaded" },
        { status: 400, headers: corsHeaders },
      );
    }

    const bytes = await file.arrayBuffer();
    const base64 = Buffer.from(bytes).toString("base64");

    if (!process.env.GOOGLE_VISION_API_KEY) {
      return Response.json(
        { error: "GOOGLE_VISION_API_KEY not set" },
        { status: 500, headers: corsHeaders },
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
    const fullText = visionData.responses?.[0]?.fullTextAnnotation?.text || "";

    if (!fullText) {
      return Response.json(
        { error: "No text extracted" },
        { status: 200, headers: corsHeaders },
      );
    }

    const result = parseWorkerDetails(fullText);
    return Response.json(result, { headers: corsHeaders });
  } catch (err) {
    console.error("OCR Error:", err);
    return Response.json(
      { error: err.message },
      { status: 500, headers: corsHeaders },
    );
  }
}

function parseWorkerDetails(text) {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const labelMap = {
    "WP No.": "WP_No",
    "Name of Worker": "Name",
    "DOB of Worker": "Date_of_Birth",
    Sex: "Sex",
    "Worker's FIN": "FIN",
    "Passport No.": "Passport_No",
    "Nationality/Citizenship": "Nationality",
  };

  const valuelines = lines.filter((l) => l.startsWith(":"));
  const labelLines = lines.filter((l) => labelMap[l]);

  const Worker_Details = {
    WP_No: null,
    Name: null,
    Date_of_Birth: null,
    Sex: null,
    FIN: null,
    Passport_No: null,
    Nationality: null,
  };

  labelLines.forEach((label, index) => {
    const key = labelMap[label];
    const rawVal = valuelines[index];
    if (rawVal) {
      Worker_Details[key] = rawVal.replace(/^:\s*/, "").trim();
    }
  });

  const Employment_History = [];
  for (let i = 0; i < lines.length; i++) {
    if (/^Employer\s+\d+$/i.test(lines[i])) {
      const employer = lines[i];
      const startDate = lines[i + 1] || null;
      const endDate = lines[i + 2] || null;
      const industry = lines[i + 3] || null;
      if (
        startDate?.match(/\d{2}\/\d{2}\/\d{4}/) &&
        endDate?.match(/\d{2}\/\d{2}\/\d{4}/)
      ) {
        Employment_History.push({
          Employer: employer,
          Start_Date: startDate,
          End_Date: endDate,
          Industry: industry,
        });
        i += 3;
      }
    }
  }

  return { Worker_Details, Employment_History };
}
