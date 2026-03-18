import React, { useCallback, useRef } from 'react';

export default function Resizer({ onResize, className = '' }) {
  const isResizing = useRef(false);
  const startXRef = useRef(0);

  const startResize = useCallback((e) => {
    isResizing.current = true;
    startXRef.current = e.pageX;
    e.preventDefault();
    e.stopPropagation();

    const handleMouseMove = (mouseEvent) => {
      if (!isResizing.current) return;
      const deltaX = mouseEvent.pageX - startXRef.current;
      
      // Update startX for the next move event to get incremental deltas
      startXRef.current = mouseEvent.pageX;
      
      onResize(deltaX, false); // false = in progress
    };

    const handleMouseUp = (mouseEvent) => {
      if (!isResizing.current) return;
      isResizing.current = false;
      const deltaX = mouseEvent.pageX - startXRef.current;
      onResize(deltaX, true); // true = final
      
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'default';
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'col-resize';
  }, [onResize]);

  return (
    <div
      onMouseDown={startResize}
      onClick={(e) => e.stopPropagation()}
      className={`absolute right-0 top-0 w-2 h-full cursor-col-resize hover:bg-blue-400 opacity-0 hover:opacity-100 transition-opacity z-10 ${className}`}
      style={{ right: '-1px' }}
    />
  );
}
