import { ChevronDown, Hexagon, LogOut, UserRound } from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/context/AuthContext";

function initials(name = "") {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

/**
 * `onProfile` is optional: only the student dashboard has a profile panel, so the
 * Profile entry is omitted for coordinator and admin rather than dead-ending.
 */
export const DashShell = ({ scopeLabel, children, tabs, onProfile }) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const signOut = async () => {
    await logout();
    navigate(`/${user?.role || "student"}/login`);
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b border-border bg-white/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-6 px-6 py-4">
          <div className="flex items-center gap-3">
            <Hexagon className="h-5 w-5" strokeWidth={2.5} />
            <span className="font-display text-base font-semibold tracking-tight">PlaceMate</span>
            <span className="hidden font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground sm:inline">
              / {user?.role}
            </span>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                data-testid="account-menu-trigger"
                className="group flex items-center gap-3 rounded-full border border-transparent py-1.5 pl-1.5 pr-3 transition-colors duration-200 hover:border-border hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring data-[state=open]:border-border data-[state=open]:bg-muted/60"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center bg-[#0A0A0A] font-mono text-[11px] font-bold text-volt">
                  {initials(user?.name) || <UserRound className="h-4 w-4" />}
                </span>
                <span className="hidden text-left sm:block">
                  <span className="block text-sm font-medium leading-tight">{user?.name}</span>
                  <span className="block font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    {user?.email}
                  </span>
                </span>
                <ChevronDown
                  className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 ease-out group-data-[state=open]:rotate-180"
                  strokeWidth={2}
                />
              </button>
            </DropdownMenuTrigger>

            <DropdownMenuContent align="end" sideOffset={8} className="w-64 rounded-none">
              <DropdownMenuLabel className="px-3 py-3">
                <p className="text-sm font-medium leading-tight">{user?.name}</p>
                <p className="mt-1 break-all font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  {user?.email}
                </p>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />

              {onProfile ? (
                <DropdownMenuItem
                  onSelect={onProfile}
                  data-testid="account-menu-profile"
                  className="cursor-pointer rounded-none px-3 py-2.5 font-mono text-[11px] uppercase tracking-[0.14em] transition-colors duration-150"
                >
                  <UserRound className="mr-2 h-3.5 w-3.5" /> Profile
                </DropdownMenuItem>
              ) : null}

              <DropdownMenuItem
                onSelect={signOut}
                data-testid="logout-button"
                className="cursor-pointer rounded-none px-3 py-2.5 font-mono text-[11px] uppercase tracking-[0.14em] text-destructive transition-colors duration-150 focus:bg-destructive/10 focus:text-destructive"
              >
                <LogOut className="mr-2 h-3.5 w-3.5" /> Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {scopeLabel ? (
          <div className="border-t border-border bg-[#0A0A0A] px-6 py-2" data-testid="access-scope-banner">
            <p className="mx-auto max-w-[1400px] font-mono text-[11px] uppercase tracking-[0.18em] text-volt">
              {scopeLabel}
            </p>
          </div>
        ) : null}
        {tabs}
      </header>
      <main className="mx-auto max-w-[1400px] px-6 py-10">{children}</main>
    </div>
  );
};

export default DashShell;
