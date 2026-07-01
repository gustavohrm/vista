export interface Env {
  ASSETS: {
    fetch: (request: Request) => Promise<Response>;
  };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Custom worker logic can go here.
    // Fallback to serving built frontend assets.
    return env.ASSETS.fetch(request);
  },
};
