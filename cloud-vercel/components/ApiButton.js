"use client";

import React from 'react';
import { Loader2, CheckCircle2, AlertCircle } from 'lucide-react';

export default function ApiButton({
  children,
  onClick,
  loading = false,
  success = false,
  error = false,
  disabled = false,
  variant = 'default',
  size = 'md',
  title,
  type = 'button',
  className = '',
  ...props
}) {
  const variantClass =
    variant === 'primary'
      ? 'primary'
      : variant === 'danger'
      ? 'danger'
      : variant === 'success'
      ? 'success'
      : variant === 'ghost'
      ? 'ghost'
      : variant === 'outline'
      ? 'outline'
      : '';
  const sizeClass = size === 'sm' ? 'btn-sm' : size === 'icon' ? 'icon-btn' : '';
  const stateClass = loading ? 'loading' : success ? 'success' : error ? 'error' : '';
  return (
    <button
      type={type}
      className={`${variantClass} ${sizeClass} ${stateClass} ${className}`}
      onClick={onClick}
      disabled={disabled || loading}
      title={title}
      {...props}
    >
      {loading ? (
        <Loader2 size={16} className="spin" />
      ) : success ? (
        <CheckCircle2 size={16} />
      ) : error ? (
        <AlertCircle size={16} />
      ) : null}
      {children}
    </button>
  );
}
