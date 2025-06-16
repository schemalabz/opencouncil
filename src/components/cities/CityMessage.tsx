"use client";

import { CityMessage as CityMessageType } from '@prisma/client'
import { ExternalLink } from 'lucide-react';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import * as LucideIcons from 'lucide-react';

interface CityMessageProps {
  message: CityMessageType;
  className?: string;
}

export function CityMessage({ message, className }: CityMessageProps) {
  const router = useRouter();

  // Dynamically get the icon from lucide-react
  const IconComponent = (LucideIcons as any)[message.emoji] || LucideIcons.Info;

  const handleCallToAction = () => {
    if (message.callToActionUrl) {
      if (message.callToActionExternal) {
        window.open(message.callToActionUrl, '_blank');
      } else {
        router.push(message.callToActionUrl);
      }
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={cn("mb-4", className)}
    >
      <div 
        className="rounded-md border p-3 text-sm"
        style={{
          backgroundColor: 'rgba(164, 192, 225, 0.15)',
          borderColor: 'rgb(164, 192, 225)',
          color: 'rgb(30, 41, 59)' // Darker slate gray for better readability
        }}
      >
        <div className="flex items-start gap-3">
          <IconComponent 
            className="h-4 w-4 mt-0.5 flex-shrink-0" 
            style={{ color: 'rgb(59, 130, 246)' }} // Darker blue for better contrast
          />
          <div className="flex-1 min-w-0">
            <div className="font-medium mb-1">
              {message.title}
            </div>
            <div className="text-sm opacity-90 mb-2">
              {message.description}
            </div>
            
            {message.callToActionText && (
              <button
                onClick={handleCallToAction}
                className="inline-flex items-center gap-1 text-sm font-medium underline underline-offset-2 transition-colors hover:opacity-80"
                style={{ color: 'rgb(29, 78, 216)' }} // Much darker blue for excellent readability
              >
                {message.callToActionText}
                {message.callToActionExternal && (
                  <ExternalLink className="h-3 w-3" />
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
} 