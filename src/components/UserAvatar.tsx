import React, { useState, useEffect } from 'react';
import { getUserInitials } from '../lib/utils';

interface UserAvatarProps {
  name?: string;
  avatarUrl?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  className?: string;
}

export const UserAvatar: React.FC<UserAvatarProps> = ({
  name = 'User',
  avatarUrl,
  size = 'md',
  className = '',
}) => {
  const [hasImageError, setHasImageError] = useState(false);

  useEffect(() => {
    setHasImageError(false);
  }, [avatarUrl]);

  const sizeClasses = {
    xs: 'w-6 h-6 text-[10px]',
    sm: 'w-8 h-8 text-xs',
    md: 'w-10 h-10 text-sm',
    lg: 'w-16 h-16 text-xl',
    xl: 'w-24 h-24 text-3xl',
    '2xl': 'w-32 h-32 text-4xl',
  };

  const initials = getUserInitials(name);

  if (avatarUrl && avatarUrl.trim() && !hasImageError) {
    return (
      <div
        className={`rounded-full overflow-hidden shrink-0 border border-slate-200 dark:border-slate-700 shadow-xs bg-slate-100 dark:bg-slate-800 ${sizeClasses[size]} ${className}`}
      >
        <img
          key={avatarUrl.length > 50 ? avatarUrl.substring(0, 50) : avatarUrl}
          src={avatarUrl}
          alt={name}
          className="w-full h-full object-cover"
          onError={() => {
            setHasImageError(true);
          }}
        />
      </div>
    );
  }

  return (
    <div
      className={`rounded-full shrink-0 flex items-center justify-center font-black uppercase bg-gradient-to-br from-blue-600 to-indigo-700 text-white shadow-xs border border-blue-400/30 select-none ${sizeClasses[size]} ${className}`}
      title={name}
    >
      <span>{initials}</span>
    </div>
  );
};
