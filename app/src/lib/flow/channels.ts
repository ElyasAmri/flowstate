// Channel registry: persistence helpers for the first-class channel concept.
//
// Channels live in their own library at `<project_dir>/.flowstate/channels/<id>.json`,
// mirroring the flow library (see commands/channels.rs). A flow references a
// channel by id; nodes never inline a channel. This module is the seam between
// the editor and the backend `*_channel(s)` commands -- it returns `null` /
// empty off-Tauri so dev/in-browser use degrades gracefully.

import type { ChannelDefinition, ChannelRegistry } from "./types";
import { tryInvoke } from "./tauri";

/** Matches the Rust `ChannelMeta` (snake_case, no rename). */
export interface ChannelMeta {
  id: string;
  title: string;
  binding_kind: string;
}

/** Build a fast id->definition lookup from a list of channels. */
export function toRegistry(channels: ChannelDefinition[]): ChannelRegistry {
  const reg: ChannelRegistry = {};
  for (const ch of channels) reg[ch.id] = ch;
  return reg;
}

/** List channel metadata. Returns `null` off-Tauri (no backend). */
export async function listChannels(): Promise<ChannelMeta[] | null> {
  const dir = await tryInvoke<string>("project_dir");
  if (dir === null) return null;
  return (await tryInvoke<ChannelMeta[]>("list_channels", { dir })) ?? [];
}

/** Read a single channel by id, or `null` if unavailable/missing. */
export async function readChannel(id: string): Promise<ChannelDefinition | null> {
  const dir = await tryInvoke<string>("project_dir");
  if (dir === null) return null;
  return await tryInvoke<ChannelDefinition>("read_channel", { dir, name: id });
}

/** Persist a channel. No-op (returns false) off-Tauri. */
export async function writeChannel(channel: ChannelDefinition): Promise<boolean> {
  const dir = await tryInvoke<string>("project_dir");
  if (dir === null) return false;
  await tryInvoke<void>("write_channel", { dir, name: channel.id, channel });
  return true;
}

/**
 * Load the whole registry as an id->definition map. Reads the list then each
 * channel. Off-Tauri returns an empty registry (callers fall back to the bundled
 * fixture registry).
 */
export async function loadRegistry(): Promise<ChannelRegistry> {
  const metas = await listChannels();
  if (metas === null) return {};
  const out: ChannelRegistry = {};
  for (const m of metas) {
    const ch = await readChannel(m.id);
    if (ch) out[ch.id] = ch;
  }
  return out;
}

/**
 * Seed the channel library with the given channels when it is empty (first run
 * under Tauri). No-op off-Tauri or when channels already exist.
 */
export async function seedChannelsIfEmpty(channels: ChannelDefinition[]): Promise<void> {
  const metas = await listChannels();
  if (metas === null || metas.length > 0) return;
  for (const ch of channels) await writeChannel(ch);
}
