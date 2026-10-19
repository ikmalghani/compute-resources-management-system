export function slugify(name: string) {
  const base = name.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 24);
  return base.length > 0 ? base : "ws";
}

export function shellPrompt(username: string, slug: string) {
  return `${username}@myspace-${slug}~:$`;
}

export function containerName(slug: string) {
  return `myspace-ws-${slug}`;
}

export function volumeName(slug: string) {
  return `myspace-vol-${slug}`;
}

export function promptHost(slug: string) {
  return `myspace-${slug}`;
}
