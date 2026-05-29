import http from "http";

const ALLOWED_ORIGIN = "https://bimsys.sharepoint.com";
const APS_TOKEN_URL = "https://developer.api.autodesk.com/authentication/v2/token";
const APS_BUCKET_KEY = "bimsys_rvt_models";

function sendJson(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(payload));
}

function sendText(res, status, text) {
  res.writeHead(status, { "Content-Type": "text/plain" });
  res.end(text);
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";

    req.on("data", chunk => {
      body += chunk.toString();
    });

    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(err);
      }
    });

    req.on("error", reject);
  });
}

async function getApsToken() {
  const clientId = process.env.APS_CLIENT_ID;
  const clientSecret = process.env.APS_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("Faltan APS_CLIENT_ID o APS_CLIENT_SECRET");
  }

  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const response = await fetch(APS_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: "grant_type=client_credentials&scope=viewables:read data:read data:write bucket:create bucket:read"
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(`APS token error: ${JSON.stringify(data)}`);
  }

  return data.access_token;
}

async function ensureBucketExists(accessToken) {
  const createResp = await fetch("https://developer.api.autodesk.com/oss/v2/buckets", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "x-ads-region": "US"
    },
    body: JSON.stringify({
      bucketKey: APS_BUCKET_KEY,
      access: "full",
      policyKey: "transient"
    })
  });

  // Si ya existe, APS suele devolver conflicto; lo ignoramos y seguimos
  if (createResp.ok || createResp.status === 409) {
    return;
  }

  const err = await createResp.text();
  throw new Error(`Error creando bucket: ${err}`);
}

async function handleApsToken(res) {
  try {
    const accessToken = await getApsToken();
    sendJson(res, 200, { access_token: accessToken });
  } catch (err) {
    sendJson(res, 500, {
      error: "Error llamando a APS",
      detail: String(err)
    });
  }
}

async function handleProcessPending(req, res) {
  try {
    const body = await readJsonBody(req);
    const { fileName, fileContentBase64 } = body || {};

    if (!fileName || !fileContentBase64) {
      return sendJson(res, 400, {
        error: "Faltan fileName o fileContentBase64"
      });
    }

    const accessToken = await getApsToken();

    await ensureBucketExists(accessToken);

    // 1) Pedir signed upload URL
    const signedResp = await fetch(
      `https://developer.api.autodesk.com/oss/v2/buckets/${APS_BUCKET_KEY}/objects/${encodeURIComponent(fileName)}/signeds3upload?minutesExpiration=15`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      }
    );

    const signedData = await signedResp.json();

    if (!signedResp.ok) {
      return sendJson(res, signedResp.status, {
        error: "Error obteniendo signed upload URL",
        detail: signedData
      });
    }

    const uploadUrl = signedData.urls?.[0];
    const uploadKey = signedData.uploadKey;

    if (!uploadUrl || !uploadKey) {
      return sendJson(res, 500, {
        error: "APS no devolvió upload URL o uploadKey"
      });
    }

    // 2) Subir binario a la signed URL
    const fileBuffer = Buffer.from(fileContentBase64, "base64");

    const uploadResp = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Type": "application/octet-stream"
      },
      body: fileBuffer
    });
