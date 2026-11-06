import { useState, useEffect } from "react";
import { FullUserPayload } from "./types";
import Header from "./components/Header";
import LandingHero from "./components/LandingHero";
import ProfileHeader from "./components/ProfileHeader";
import GradeSection from "./components/GradeSection";
import FlightsSection from "./components/FlightsSection";
import AtcSection from "./components/AtcSection";
import AviationMapSection from "./components/AviationMapSection";
import Footer from "./components/Footer";
import UserNotFoundModal from "./components/UserNotFoundModal";
import {
  Shield,
  Plane,
  Radio,
  Map as MapIcon,
} from "lucide-react";

type DashboardTab = "grade" | "flights" | "atc";

export default function App() {
  const [currentUsername, setCurrentUsername] = useState<string | null>(null);
  const [userData, setUserData] = useState<FullUserPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState<{ query: string; title: string; message: string } | null>(null);
  const [activeTab, setActiveTab] = useState<DashboardTab>("grade");

  // Dark mode state with localStorage persistence
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("veyro-theme") || localStorage.getItem("yevro-theme");
      if (saved) return saved === "dark";
      return window.matchMedia("(prefers-color-scheme: dark)").matches;
    }
    return false;
  });

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("veyro-theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("veyro-theme", "light");
    }
  }, [isDarkMode]);

  const toggleDarkMode = () => {
    setIsDarkMode((prev) => !prev);
  };

  // Check URL hash for routing (#pilot=...)
  useEffect(() => {
    const handleHash = () => {
      const hash = window.location.hash;
      if (hash.startsWith("#pilot=")) {
        const pilot = decodeURIComponent(hash.replace("#pilot=", ""));
        if (pilot) {
          handleSearch(pilot);
        }
      }
    };

    handleHash();
    window.addEventListener("hashchange", handleHash);
    return () => window.removeEventListener("hashchange", handleHash);
  }, []);

  const handleSearch = async (username: string) => {
    const cleaned = username.trim();
    if (!cleaned) return;

    setLoading(true);
    setSearchError(null);

    try {
      const res = await fetch(`/api/user/full/${encodeURIComponent(cleaned)}`);
      const data = await res.json();

      if (!res.ok) {
        if (res.status === 404) {
          throw {
            title: "Player Not Found",
            message: data.message || `No Infinite Flight Community account found for "${cleaned}". Please verify the IFC username spelling.`,
          };
        } else if (res.status === 429) {
          throw {
            title: "Rate Limit Exceeded",
            message: "Infinite Flight API rate limit encountered. Please wait a minute before searching again.",
          };
        } else {
          throw {
            title: "API Error",
            message: data.message || "Failed to load player statistics. Please try again.",
          };
        }
      }

      setUserData(data);
      setCurrentUsername(cleaned);
      window.location.hash = `#pilot=${encodeURIComponent(cleaned)}`;
    } catch (err: any) {
      setSearchError({
        query: cleaned,
        title: err.title || "Lookup Error",
        message: err.message || "An unexpected error occurred while fetching player data.",
      });
    } finally {
      setLoading(false);
    }
  };

  const [landingView, setLandingView] = useState<"hero" | "map">("hero");

  const handleToggleMap = () => {
    if (userData) {
      setCurrentUsername(null);
      setUserData(null);
      setLandingView("map");
      window.location.hash = "";
    } else {
      setLandingView((prev) => (prev === "map" ? "hero" : "map"));
    }
  };

  const handleHomeClick = () => {
    setCurrentUsername(null);
    setUserData(null);
    setSearchError(null);
    setLandingView("hero");
    window.location.hash = "";
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0b0f19] text-slate-900 dark:text-slate-100 flex flex-col selection:bg-slate-200 dark:selection:bg-slate-700 selection:text-slate-900 dark:selection:text-white transition-colors duration-200">
      <Header
        currentUsername={currentUsername || undefined}
        onSearch={handleSearch}
        onHomeClick={handleHomeClick}
        isLiveFlying={userData?.liveStatus.isOnline}
        isLiveControlling={userData?.liveAtcStatus?.isControlling}
        isDarkMode={isDarkMode}
        onToggleDarkMode={toggleDarkMode}
        isMapActive={!userData && landingView === "map"}
        onToggleMap={handleToggleMap}
      />

      <main className="flex-1">
        {!userData ? (
          landingView === "map" ? (
            <div className="h-[calc(100vh-57px)] w-full overflow-hidden">
              <AviationMapSection onSearchPilot={handleSearch} onClose={() => setLandingView("hero")} />
            </div>
          ) : (
            <LandingHero
              onSearch={handleSearch}
              isLoading={loading}
            />
          )
        ) : (
          /* Full Player Dashboard */
          <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 space-y-6">
            {/* Profile Header */}
            <ProfileHeader
              user={userData.user}
              liveStatus={userData.liveStatus}
              liveAtcStatus={userData.liveAtcStatus}
            />

            {/* Navigation Tabs */}
            <div className="w-full sm:w-auto">
              <div className="grid grid-cols-3 w-full sm:w-auto sm:inline-flex rounded-xl bg-slate-200/70 dark:bg-slate-800/80 p-1 border border-slate-200 dark:border-slate-700 text-xs gap-1 sm:gap-0">
                <button
                  id="tab-grade"
                  onClick={() => setActiveTab("grade")}
                  className={`flex items-center justify-center gap-1.5 rounded-lg py-2 px-1 sm:px-3.5 sm:py-1.5 font-medium transition-all cursor-pointer text-center ${
                    activeTab === "grade"
                      ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs font-semibold"
                      : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                  }`}
                >
                  <Shield className="h-3.5 w-3.5 shrink-0" />
                  <span className="hidden sm:inline">Grade Matrix</span>
                  <span className="sm:hidden text-[11px]">Grade</span>
                </button>

                <button
                  id="tab-flights"
                  onClick={() => setActiveTab("flights")}
                  className={`flex items-center justify-center gap-1.5 rounded-lg py-2 px-1 sm:px-3.5 sm:py-1.5 font-medium transition-all cursor-pointer text-center ${
                    activeTab === "flights"
                      ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs font-semibold"
                      : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                  }`}
                >
                  <Plane className="h-3.5 w-3.5 shrink-0" />
                  <span className="hidden sm:inline">Flight Log ({userData.flights.totalCount})</span>
                  <span className="sm:hidden text-[11px] truncate">Flights ({userData.flights.totalCount})</span>
                </button>

                <button
                  id="tab-atc"
                  onClick={() => setActiveTab("atc")}
                  className={`flex items-center justify-center gap-1.5 rounded-lg py-2 px-1 sm:px-3.5 sm:py-1.5 font-medium transition-all cursor-pointer text-center ${
                    activeTab === "atc"
                      ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs font-semibold"
                      : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                  }`}
                >
                  <Radio className="h-3.5 w-3.5 shrink-0" />
                  <span className="hidden sm:inline">ATC Controlling ({userData.atc.totalCount})</span>
                  <span className="sm:hidden text-[11px] truncate">ATC ({userData.atc.totalCount})</span>
                </button>
              </div>
            </div>

            {/* Active Tab Content */}
            {activeTab === "grade" && (
              <GradeSection gradeData={userData.gradeData} user={userData.user} />
            )}

            {activeTab === "flights" && (
              <FlightsSection
                flights={userData.flights.data}
                totalFlightCount={userData.flights.totalCount}
                userId={userData.user.userId}
                onFlightsUpdated={(newFlights) => {
                  setUserData((prev) =>
                    prev
                      ? {
                          ...prev,
                          flights: {
                            ...prev.flights,
                            data: newFlights,
                            totalCount: Math.max(prev.flights.totalCount, newFlights.length),
                          },
                        }
                      : null
                  );
                }}
              />
            )}

            {activeTab === "atc" && (
              <AtcSection
                sessions={userData.atc.data}
                totalAtcOperations={userData.user.atcOperations}
                totalAtcCount={userData.atc.totalCount}
                userId={userData.user.userId}
                atcRank={userData.user.atcRank}
                controllerName={userData.user.discourseUsername}
                onSessionsUpdated={(newSessions) => {
                  setUserData((prev) =>
                    prev
                      ? {
                          ...prev,
                          atc: {
                            ...prev.atc,
                            data: newSessions,
                            totalCount: Math.max(prev.atc.totalCount, newSessions.length),
                          },
                        }
                      : null
                  );
                }}
              />
            )}
          </div>
        )}
      </main>

      {(!(!userData && landingView === "map")) && <Footer />}

      <UserNotFoundModal
        isOpen={Boolean(searchError)}
        onClose={() => setSearchError(null)}
        searchedQuery={searchError ? searchError.query : ""}
        errorMessage={searchError ? searchError.message : undefined}
        onRetryFocus={() => {
          const input = document.getElementById("landing-search-input") || document.getElementById("header-pilot-search");
          if (input) {
            (input as HTMLInputElement).focus();
            (input as HTMLInputElement).select();
          }
        }}
      />
    </div>
  );
}
