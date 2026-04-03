import { motion } from "motion/react";
import { useState } from "react";
import { useSaveUserProfile } from "../hooks/useQueries";

export default function UsernameModal() {
  const [name, setName] = useState("");
  const { mutate, isPending } = useSaveUserProfile();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    mutate(name.trim());
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
      data-ocid="username.modal"
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-dc-sidebar rounded-lg p-8 w-full max-w-md shadow-2xl"
      >
        <h2 className="text-2xl font-bold text-dc-primary mb-2">
          Welcome to Cordis!
        </h2>
        <p className="text-dc-secondary mb-6">
          Choose your username to get started.
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="username-input"
              className="block text-xs font-bold text-dc-secondary uppercase tracking-wide mb-2"
            >
              Username
            </label>
            <input
              id="username-input"
              data-ocid="username.input"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter a username"
              maxLength={32}
              // biome-ignore lint/a11y/noAutofocus: intentional for onboarding modal
              autoFocus
              className="w-full px-3 py-2 bg-dc-chat text-dc-primary rounded placeholder-dc-muted border border-dc-serverbar focus:outline-none focus:ring-2 focus:ring-dc-blurple text-sm"
            />
          </div>
          <button
            data-ocid="username.submit_button"
            type="submit"
            disabled={isPending || !name.trim()}
            className="w-full py-2 bg-dc-blurple text-white font-medium rounded hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {isPending ? "Setting up..." : "Get Started"}
          </button>
        </form>
      </motion.div>
    </div>
  );
}
