/** @type {import('next').NextConfig} */
const nextConfig = {
  // Static export: `npm run build` writes a deployable site to ./out
  output: "export",
  // Set NEXT_PUBLIC_RELATIVE=1 to build with relative asset paths (for hosting in a sub-folder)
  assetPrefix: process.env.NEXT_PUBLIC_RELATIVE ? "./" : undefined,
  images: { unoptimized: true },
};
export default nextConfig;
