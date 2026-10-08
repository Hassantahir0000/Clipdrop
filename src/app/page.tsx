import { Downloader } from "@/components/downloader";

export default function Home() {
  return (
    <main className="relative flex flex-1 flex-col items-center px-4 py-12 sm:py-20">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[480px] bg-[radial-gradient(ellipse_at_top,rgba(120,119,198,0.25),transparent_65%)]"
      />
      <header className="mb-10 max-w-xl text-center">
        <h1 className="text-3xl font-bold tracking-tight text-white sm:text-5xl">Social Video Downloader</h1>
        <p className="mt-4 text-zinc-400">
          Paste a link to a public post from YouTube, Instagram, Twitter / X or Facebook and get the video in the
          highest quality it&apos;s available in.
        </p>
      </header>

      <Downloader />

      <footer className="mt-12 max-w-xl text-center text-xs leading-relaxed text-zinc-500">
        Only public posts can be downloaded. Private posts, posts that need a login, and DRM-protected content won&apos;t
        work. Please respect creators&apos; rights and each platform&apos;s terms of service.
      </footer>
    </main>
  );
}
