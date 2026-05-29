const httpTrigger = async function (context, req) {
  try {
    const clientId = process.env.APS_CLIENT_ID;
    const clientSecret = process.env.APS_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      context.res = {
        status: 500,
        body: { error: "Faltan APS_CLIENT_ID o APS_CLIENT_SECRET" }
      };
      return;
    }

    const { fileName, fileContentBase64 } = req.body || {};

    if (!fileName || !fileContentBase64) {
      context.res = {
        status: 400,
        body: { error: "Faltan fileName o fileContentBase64" }
      };
      return;
    }

    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

    const tokenResp = await fetch(
      "https://developer.api.autodesk.com/authentication/v2/token",
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${basicAuth}`,
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: "grant_type=client_credentials&scope=data:read data:write bucket:create bucket:read viewables:read"
      }
    );

    const tokenJson = await tokenResp.json();
    const accessToken = tokenJson.access_token;

    const bucketKey = "bimsys_rvt_models";
    const objectKey = fileName;

    const uploadResp = await fetch(
      `https://developer.api.autodesk.com/oss/v2/buckets/${bucketKey}/objects/${objectKey}`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/octet-stream"
        },
        body: Buffer.from(fileContentBase64, "base64")
      }
    );

    const uploadJson = await uploadResp.json();
    const objectId = uploadJson.objectId;

    const urn = Buffer.from(objectId).toString("base64").replace(/=/g, "");

    await fetch("https://developer.api.autodesk.com/modelderivative/v2/designdata/job", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        input: { urn },
        output: {
          formats: [{ type: "svf2", views: ["3d"] }]
        }
      })
    });

    context.res = {
      status: 200,
      body: { urn }
    };

  } catch (error) {
    context.res = {
      status: 500,
      body: { error: error.message }
    };
  }
};

module.exports = httpTrigger;
