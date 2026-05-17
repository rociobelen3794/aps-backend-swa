import http from "http";

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const path = url.pathname;

  // CORS para SharePoint
  res.setHeader("Access-Control-Allow-Origin", "https://bimsys.sharepoint.com");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(200);
    return res.end();
  }

  // Endpoint del token
  if (path === "/api/aps-token" || path === "/api/aps-token/") {
    const clientId = process.env.APS_CLIENT_ID;
    const clientSecret = process.env.APS_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      res.writeHead(500, { "Content-Type": "application/json" });
      return res.end(
        JSON.stringify({ error: "Faltan APS_CLIENT_ID o APS_CLIENT_SECRET" })
      );
    }

    try {
      const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

      const response = await fetch(
        "https://developer.api.autodesk.com/authentication/v2/token",
        {
          method: "POST",
          headers: {
            Authorization: `Basic ${basic}`,
            "Content-Type": "application/x-www-form-urlencoded"
          },
          body: "grant_type=client_credentials&scope=viewables:read data:read data:write"
        }
      );

      const data = await response.json();

      res.writeHead(response.status, { "Content-Type": "application/json" });
      return res.end(JSON.stringify(data));
    } catch (err) {
      res.writeHead(500, { "Content-Type": "application/json" });
      return res.end(
        JSON.stringify({ error: "Error llamando a APS", detail: String(err) })
      );
    }
  }

  // Root
  if (path === "/" || path === "") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    return res.end("APS Token Backend OK");
  }

  // Cualquier otra ruta
  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("Not Found");
});

server.listen(process.env.PORT || 3000);
