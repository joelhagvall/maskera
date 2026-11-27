import { existsSync, readdirSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

// The site sends buyers and readers into the customer portal on
// app.maskera.dev, built from the sibling checkout ../maskera-cloud. Every
// portalUrl() path must be a route there, and every ?buy= product one the
// portal's login intent knows, or a pricing button lands on a 404 or a plain
// sign-in. Runs wherever both checkouts are present, skipped elsewhere.
const cloudWeb = resolve(__dirname, "../../../../maskera-cloud/apps/web/src")
const routesDir = resolve(cloudWeb, "routes")

function portalLinks(): { file: string; path: string; query: URLSearchParams }[] {
  const dir = resolve(__dirname, "../src/components")
  return readdirSync(dir)
    .filter((file) => file.endsWith(".tsx"))
    .flatMap((file) =>
      [...readFileSync(resolve(dir, file), "utf8").matchAll(/portalUrl\(\s*"([^"]+)"/g)].map(
        (m) => {
          const url = new URL(m[1], "https://app.maskera.dev")
          return { file, path: url.pathname, query: url.searchParams }
        },
      ),
    )
}

/** TanStack file route for a path under the optional locale: /extension/privacy -> {-$locale}.extension_.privacy.tsx */
function routeExists(path: string, routes: string[]): boolean {
  const segments = path
    .split("/")
    .filter(Boolean)
    .map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
  const pattern = new RegExp(`^\\{-\\$locale\\}\\.${segments.join("_?\\.")}\\.tsx$`)
  return routes.some((file) => pattern.test(file))
}

describe.skipIf(!existsSync(routesDir))("portal links into maskera-cloud", () => {
  it("point at routes the portal has and products its login knows", () => {
    const routes = readdirSync(routesDir)
    const loginIntent = readFileSync(resolve(cloudWeb, "lib/login-intent.ts"), "utf8")
    const links = portalLinks()
    expect(links.length).toBeGreaterThan(0)
    for (const link of links) {
      expect(routeExists(link.path, routes), `${link.file}: ${link.path}`).toBe(true)
      const buy = link.query.get("buy")
      if (buy) expect(loginIntent, `${link.file}: buy=${buy}`).toContain(`"${buy}"`)
    }
  })
})
