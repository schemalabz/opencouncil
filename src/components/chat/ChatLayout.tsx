"use client"

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

export default function ChatLayout({
  children
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname();
  const isChatPage = pathname === '/chat';

  useEffect(() => {
    if (isChatPage) {
      // Make header sticky
      const header = document.querySelector('header');
      if (header) {
        header.classList.add('sticky', 'top-0', 'z-50');
      }

      // Hide footer
      const footer = document.querySelector('footer');
      if (footer) {
        footer.style.display = 'none';
      }

      // Adjust main content height
      const main = document.querySelector('main');
      if (main) {
        main.classList.add('h-[calc(100vh-80px)]');
        main.classList.remove('min-h-[70vh]', 'mt-[65px]');
      }
    }

    return () => {
      // Cleanup
      const header = document.querySelector('header');
      if (header) {
        header.classList.remove('sticky', 'top-0', 'z-50');
      }

      const footer = document.querySelector('footer');
      if (footer) {
        footer.style.display = '';
      }

      const main = document.querySelector('main');
      if (main) {
        main.classList.remove('h-[calc(100vh-80px)]');
        main.classList.add('min-h-[70vh]', 'mt-[65px]');
      }
    };
  }, [isChatPage]);

  return children;
} 