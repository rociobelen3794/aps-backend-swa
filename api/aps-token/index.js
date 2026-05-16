module.exports = async function (context, req) {
  const clientId = process.env.APS_CLIENT_ID;
  const clientSecret = process.env.APS_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    context.res = {
      status: 500,
      body: {
        error: "Faltan APS_CLIENT_ID o APS_CLIENT_SECRET"
      }
    };
    return;
  }

  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const response = await fetch(
    "https://developer.api.autodesk.com/authentication/v2/token",
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${basicAuth}`,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: "grant_type=client_credentials&scope=viewables:read data:read data:write"
    }
  );

  const data = await response.json();

  context.res = {
    status: response.status,
    body: data
  };
};
