import { Request, Response } from "express";
import axios from "axios";

type IceServerConfig = {
  urls: string | string[];
  username?: string;
  credential?: string;
};

export function getCallsConfigController(_req: Request, res: Response) {
  const iceServers: IceServerConfig[] = [];
  const rawStun = process.env.STUN_URLS ?? "";
  const stunUrls = rawStun
    .split(",")
    .map((url) => url.trim())
    .filter((url) => url.length > 0);

  if (stunUrls.length) {
    iceServers.push({ urls: stunUrls });
  } else {
    iceServers.push({ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] });
  }

  const turnUrl = process.env.TURN_URL?.trim();
  const turnUsername = process.env.TURN_USERNAME?.trim();
  const turnPassword = process.env.TURN_PASSWORD?.trim();
  if (turnUrl && turnUsername && turnPassword) {
    iceServers.push({
      urls: turnUrl,
      username: turnUsername,
      credential: turnPassword
    });
  }

  iceServers.push({
    urls: [
      "turn:openrelay.metered.ca:80",
      "turn:openrelay.metered.ca:443",
      "turn:openrelay.metered.ca:443?transport=tcp"
    ],
    username: "openrelayproject",
    credential: "openrelayproject"
  });

  res.json({ iceServers });
}

export async function getSpeechTokenController(_req: Request, res: Response) {
  const speechKey = process.env.SPEECH_KEY;
  const speechRegion = process.env.SPEECH_REGION;

  if (!speechKey || !speechRegion) {
    return res.status(500).json({ error: "Azure Speech keys not configured on server" });
  }

  try {
    const headers = {
      "Ocp-Apim-Subscription-Key": speechKey,
      "Content-Type": "application/x-www-form-urlencoded"
    };

    console.log(`Fetching speech token for region: ${speechRegion}`);

    const response = await axios.post(
      `https://${speechRegion}.api.cognitive.microsoft.com/sts/v1.0/issueToken`,
      null,
      { 
        headers,
        responseType: 'text' // Ensure we get the raw string token
      }
    );

    console.log("Speech token fetched successfully");
    res.json({ token: response.data, region: speechRegion });
  } catch (error) {
    if (axios.isAxiosError(error)) {
        console.error("Azure Speech API Error:", {
            status: error.response?.status,
            statusText: error.response?.statusText,
            data: error.response?.data,
            region: speechRegion
        });
    } else {
        console.error("Error fetching speech token:", error);
    }
    res.status(500).json({ error: "Failed to fetch speech token" });
  }
}
