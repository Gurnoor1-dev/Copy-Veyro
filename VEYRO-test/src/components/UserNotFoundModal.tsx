import React, { useEffect } from "react";
import { X } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface UserNotFoundModalProps {
  isOpen: boolean;
  onClose: () => void;
  searchedQuery: string;
  errorMessage?: string;
  onRetryFocus?: () => void;
}

export const UserNotFoundModal: React.FC<UserNotFoundModalProps> = ({
  isOpen,
  onClose,
  searchedQuery,
}) => {
  // Auto-dismiss after 3.5 seconds
  useEffect(() => {
    if (!isOpen) return;
    const timer = setTimeout(() => {
      onClose();
    }, 3500);
    return () => clearTimeout(timer);
  }, [isOpen, onClose]);

  // Also close on Escape key press
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed bottom-6 inset-x-0 z-50 flex justify-center pointer-events-none px-4">
          <motion.div
            initial={{ opacity: 0, y: 14, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 14, scale: 0.95 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="pointer-events-auto flex items-center gap-2 rounded-xl bg-red-600 dark:bg-red-600 text-white px-3.5 py-2 text-xs font-medium shadow-lg shadow-red-950/20 border border-red-500"
          >
            <span className="font-semibold text-white">
              User not found
            </span>
            {searchedQuery && (
              <span className="font-mono text-[11px] text-red-100 max-w-[140px] truncate">
                "{searchedQuery}"
              </span>
            )}
            <button
              type="button"
              onClick={onClose}
              className="ml-1 p-0.5 rounded text-red-200 hover:text-white transition cursor-pointer"
              aria-label="Dismiss notification"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default UserNotFoundModal;
