import {
  BarChart3, Activity, Settings, Bolt, Leaf, TrendingUp,
  AlertTriangle, PanelLeftClose, PanelLeftOpen, FileText,
  UserCircle2, Users, CloudSun, BellRing, MessagesSquare,
  ClipboardList, Factory, History, SlidersHorizontal,
  Wrench, DollarSign,
} from "lucide-react";

// ─── Pages par rôle ───────────────────────────────────────────────────────────
const ROLE_PAGES = {
  admin: [
    { key: "dashboard",   label: "Dashboard Overview",   icon: BarChart3       },
    { key: "industry",    label: "Industry Overview",    icon: Factory         },
    { key: "realtime",    label: "Real-Time Monitoring", icon: Activity        },
    { key: "equipment",   label: "Equipment Status",     icon: Settings        },
    { key: "power",       label: "Power Quality",        icon: Bolt            },
    { key: "carbon",      label: "Carbon Emissions",     icon: Leaf            },
    { key: "forecasting", label: "Forecasting",          icon: TrendingUp      },
    { key: "reports",     label: "Reports & Analytics",  icon: FileText        },
    { key: "alarms",      label: "Alarms & Events",      icon: AlertTriangle   },
    { key: "history",     label: "Historical Data",      icon: History         },
    { key: "maintenance", label: "Maintenance",          icon: Wrench          },
    { key: "prices",      label: "Energy Prices",        icon: DollarSign      },
    { key: "weather",     label: "Weather",              icon: CloudSun        },
    { key: "messages",    label: "Messages",             icon: MessagesSquare, badge: "message" },
    { key: "profile",     label: "My Profile",           icon: UserCircle2     },
    { key: "users",       label: "Users Management",     icon: Users           },
    { key: "thresholds",  label: "Alarm Thresholds",     icon: SlidersHorizontal },
    { key: "urgent",      label: "Urgent Messages",      icon: BellRing,       badge: "urgent" },
    { key: "audit",       label: "Audit Logs",           icon: ClipboardList   },
        { key: "sld",         label: "SLD Monitoring",          icon: Activity    },

  ],
  management: [
    { key: "dashboard",   label: "Dashboard Overview",   icon: BarChart3       },
    { key: "industry",    label: "Industry Overview",    icon: Factory         },
    { key: "carbon",      label: "Carbon Emissions",     icon: Leaf            },
    { key: "forecasting", label: "Forecasting",          icon: TrendingUp      },
    { key: "reports",     label: "Reports & Analytics",  icon: FileText        },
    { key: "prices",      label: "Energy Prices",        icon: DollarSign      },
    { key: "weather",     label: "Weather",              icon: CloudSun        },
    { key: "messages",    label: "Messages",             icon: MessagesSquare, badge: "message" },
    { key: "profile",     label: "My Profile",           icon: UserCircle2     },
  ],
  maintenance: [
    { key: "realtime",    label: "Real-Time Monitoring", icon: Activity        },
    { key: "equipment",   label: "Equipment Status",     icon: Settings        },
    { key: "power",       label: "Power Quality",        icon: Bolt            },
    { key: "alarms",      label: "Alarms & Events",      icon: AlertTriangle   },
    { key: "history",     label: "Historical Data",      icon: History         },
    { key: "thresholds",  label: "Alarm Thresholds",     icon: SlidersHorizontal },
    { key: "maintenance", label: "Maintenance",          icon: Wrench          },
    { key: "weather",     label: "Weather",              icon: CloudSun        },
    { key: "messages",    label: "Messages",             icon: MessagesSquare, badge: "message" },
    { key: "profile",     label: "My Profile",           icon: UserCircle2     },
  ],
  operator: [
    { key: "dashboard",   label: "Dashboard Overview",   icon: BarChart3   },
    { key: "equipment",   label: "Equipment Status",     icon: Settings    },
    { key: "sld",         label: "SLD Monitoring",          icon: Activity    },
    { key: "weather",     label: "Weather",              icon: CloudSun    },
    { key: "messages",    label: "Messages",             icon: MessagesSquare, badge: "message" },
    { key: "profile",     label: "My Profile",           icon: UserCircle2 },
  ],
};

const ROLE_BADGE = {
  admin:       { label: "Admin",       color: "#7c3aed", bg: "#f3e8ff" },
  management:  { label: "Management",  color: "#2563eb", bg: "#eff6ff" },
  maintenance: { label: "Maintenance", color: "#d97706", bg: "#fffbeb" },
  operator:    { label: "Operator",    color: "#0891b2", bg: "#ecfeff" },
};

export default function Sidebar({
  activePage,
  setActivePage,
  sidebarOpen,
  setSidebarOpen,
  currentUser,
  urgentCount       = 0,
  messageNotifCount = 0,
}) {
  const role  = currentUser?.role || "management";
  const items = ROLE_PAGES[role]  || ROLE_PAGES.management;
  const rb    = ROLE_BADGE[role]  || ROLE_BADGE.management;

  return (
    <div className={`sidebar ${sidebarOpen ? "open" : "closed"}`}>
      <div className="sidebar-top">
        {sidebarOpen && <h2>EMS</h2>}
        <button className="sidebar-toggle-btn"
          onClick={() => setSidebarOpen(prev => !prev)} type="button">
          {sidebarOpen ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
        </button>
      </div>

      {/* Badge rôle */}
      {sidebarOpen && (
        <div style={{
          background: rb.bg, color: rb.color,
          borderRadius: "8px", padding: "4px 10px",
          fontSize: "0.72rem", fontWeight: 700,
          textAlign: "center", marginBottom: "10px",
          border: `1px solid ${rb.color}33`,
        }}>
          {rb.label}
        </div>
      )}

      <ul>
        {items.map(item => {
          const Icon  = item.icon;
          const badge = item.badge === "message" ? messageNotifCount
                      : item.badge === "urgent"  ? urgentCount
                      : 0;
          return (
            <li key={item.key}
              className={activePage === item.key ? "active" : ""}
              onClick={() => setActivePage(item.key)}
              title={item.label}>
              <div className="sidebar-item">
                <Icon size={18} className="sidebar-icon" />
                {sidebarOpen && <span>{item.label}</span>}
                {sidebarOpen && badge > 0 && (
                  <span className="sidebar-notification-badge">{badge}</span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}