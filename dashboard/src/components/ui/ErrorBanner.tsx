export function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="my-3 px-3.5 py-2.5 rounded-md bg-err-bg border border-err-border text-err-text text-[13px]">
      ⚠ {message}
    </div>
  );
}
