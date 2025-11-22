import { NextFunction, Request, Response } from "express";
import { getSystemSetting, updateSystemSetting } from "../data/repositories";
import { AiConfig } from "../models/_types";

export async function getAiConfigController(req: Request, res: Response, next: NextFunction) {
  try {
    const config = await getSystemSetting<AiConfig>("ai-config");
    res.json(config || { provider: "openai" });
  } catch (error) {
    next(error);
  }
}

export async function updateAiConfigController(req: Request, res: Response, next: NextFunction) {
  try {
    const { provider, apiKey, localUrl, modelName } = req.body;
    const config: AiConfig = {
      provider,
      apiKey,
      localUrl,
      modelName
    };
    await updateSystemSetting("ai-config", config);
    res.json(config);
  } catch (error) {
    next(error);
  }
}
