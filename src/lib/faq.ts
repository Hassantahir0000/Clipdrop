/** Shared by the landing page and the FAQPage JSON-LD, so the two never drift apart. */
export const FAQ = [
  {
    q: "Why did my private post fail?",
    a: "We can only reach what anyone on the internet can see. Private accounts, friends-only posts and anything behind a login return an error instead of a video.",
  },
  {
    q: "What quality do I get?",
    a: "The highest the platform offers for that post by default: up to 4K at 60 fps on YouTube, usually 1080p elsewhere. You can also pick a lower resolution or audio only (MP3). The preview shows resolution, frame rate, codec and file size before you download.",
  },
  {
    q: "Why is my 4K file .mkv?",
    a: "YouTube serves 4K as VP9 or AV1 video with separate audio. We merge them into .mkv so nothing gets re-encoded and you keep full quality. VLC, IINA and most editors open it.",
  },
  { q: "Is it free?", a: "Yes. No account, no trial and no quality limits." },
  {
    q: "Is my data stored?",
    a: "No. Files are deleted right after your download finishes, and we never ask who you are. We use Google Analytics to count visits and see which features get used.",
  },
];
