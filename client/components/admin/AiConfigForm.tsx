"use client";

import { useEffect, useState } from "react";
import { apiRequest } from "../../lib/apiClient";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";

type AiProvider = "openai" | "gemini" | "claude" | "local";

interface AiConfig {
  provider: AiProvider;
  apiKey?: string;
  localUrl?: string;
  modelName?: string;
}

export function AiConfigForm() {
  const [config, setConfig] = useState<AiConfig>({ provider: "openai" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    loadConfig();
  }, []);

  async function loadConfig() {
    try {
      const data = await apiRequest<AiConfig>("/admin/ai-config");
      setConfig(data);
    } catch (err) {
      console.error("Failed to load AI config", err);
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const updated = await apiRequest<AiConfig>("/admin/ai-config", {
        method: "PUT",
        body: JSON.stringify(config)
      });
      setConfig(updated);
      setMessage({ type: "success", text: "Configuration saved successfully." });
    } catch (err: any) {
      setMessage({ type: "error", text: err.message || "Failed to save configuration." });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="p-4 text-ink-400">Loading configuration...</div>;
  }

  return (
    <Card title="AI Provider Configuration" helperText="Configure the AI model used for chat and automation.">
      <form onSubmit={handleSubmit} className="mt-4 space-y-4">
        <div>
          <label className="block text-sm font-medium text-ink-900">Provider</label>
          <select
            value={config.provider}
            onChange={(e) => setConfig({ ...config, provider: e.target.value as AiProvider })}
            className="mt-1 block w-full rounded-md border border-ink-200 bg-white px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
          >
            <option value="openai">OpenAI</option>
            <option value="gemini">Google Gemini</option>
            <option value="claude">Anthropic Claude</option>
            <option value="local">Local / Custom</option>
          </select>
        </div>

        {config.provider !== "local" && (
          <div>
            <label className="block text-sm font-medium text-ink-900">API Key</label>
            <input
              type="password"
              value={config.apiKey || ""}
              onChange={(e) => setConfig({ ...config, apiKey: e.target.value })}
              placeholder={`Enter ${config.provider} API Key`}
              className="mt-1 block w-full rounded-md border border-ink-200 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
          </div>
        )}

        {config.provider === "local" && (
          <div>
            <label className="block text-sm font-medium text-ink-900">Local URL</label>
            <input
              type="text"
              value={config.localUrl || ""}
              onChange={(e) => setConfig({ ...config, localUrl: e.target.value })}
              placeholder="http://localhost:11434/v1"
              className="mt-1 block w-full rounded-md border border-ink-200 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-ink-900">Model Name (Optional)</label>
          <input
            type="text"
            value={config.modelName || ""}
            onChange={(e) => setConfig({ ...config, modelName: e.target.value })}
            placeholder={config.provider === "openai" ? "gpt-4-turbo" : "default"}
            className="mt-1 block w-full rounded-md border border-ink-200 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
          />
        </div>

        {message && (
          <div
            className={`rounded-md p-3 text-sm ${
              message.type === "success" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
            }`}
          >
            {message.text}
          </div>
        )}

        <div className="flex justify-end">
          <Button type="submit" disabled={saving}>
            {saving ? "Saving..." : "Save Configuration"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
