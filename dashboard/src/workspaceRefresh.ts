import type { Gateway, Travel, User } from "./types";

type WorkspaceData = { travels: Travel[]; users: User[]; gateways: Gateway[] };
type Readers = { [K in keyof WorkspaceData]: () => Promise<WorkspaceData[K]> };
type Receivers = {
  [K in keyof WorkspaceData]: (data: WorkspaceData[K]) => void;
};

/** Publish each healthy service immediately; failures never erase its peers. */
export async function refreshWorkspace(
  readers: Readers,
  receivers: Receivers,
  isCurrent: () => boolean,
) {
  const labels = {
    travels: "Travel plans",
    users: "People",
    gateways: "Payments",
  };
  async function read<K extends keyof WorkspaceData>(key: K) {
    try {
      const data = await readers[key]();
      if (isCurrent()) receivers[key](data);
      return null;
    } catch (error) {
      return isCurrent()
        ? `${labels[key]}: ${error instanceof Error ? error.message : "The service is unavailable. Please try again."}`
        : null;
    }
  }
  const errors = await Promise.all([
    read("travels"),
    read("users"),
    read("gateways"),
  ]);
  return isCurrent()
    ? errors.filter((error): error is string => error !== null)
    : [];
}
