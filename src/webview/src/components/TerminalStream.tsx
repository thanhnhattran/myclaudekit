import React, { useEffect, useRef } from 'react';

interface TerminalStreamProps {
  content: string;
}

export function TerminalStream({ content }: TerminalStreamProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Auto-scroll to bottom when content changes
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [content]);

  return (
    <div className="terminal-stream" ref={containerRef}>
      <pre>{content || 'No output yet...'}</pre>
    </div>
  );
}
