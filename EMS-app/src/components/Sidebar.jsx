import {
  BarChart3, Activity, Settings, Bolt, Leaf, TrendingUp,
  AlertTriangle, PanelLeftClose, PanelLeftOpen, FileText,
  UserCircle2, Users, CloudSun, BellRing, MessagesSquare,
  ClipboardList, Factory, History, SlidersHorizontal,
  Wrench, Target, DollarSign,
} from "lucide-react";

export default function Sidebar({
  activePage,
  setActivePage,
  sidebarOpen,
  setSidebarOpen,
  currentUser,
  urgentCount       = 0,
  messageNotifCount = 0,
}) {
  const items = [
    { key: "dashboard",   label: "Dashboard Overview",    icon: BarChart3       },
    { key: "industry",    label: "Industry Overview",     icon: Factory         },
    { key: "realtime",    label: "Real-Time Monitoring",  icon: Activity        },
    { key: "equipment",   label: "Equipment Status",      icon: Settings        },
    { key: "power",       label: "Power Quality",         icon: Bolt            },
    { key: "carbon",      label: "Carbon Emissions",      icon: Leaf            },
    { key: "forecasting", label: "Forecasting",           icon: TrendingUp      },
    { key: "reports",     label: "Reports & Analytics",   icon: FileText        },
    { key: "alarms",      label: "Alarms & Events",       icon: AlertTriangle   },
    { key: "history",     label: "Historical Data",       icon: History         },
    { key: "maintenance", label: "Maintenance",           icon: Wrench          },
    { key: "objectives",  label: "Energy Objectives",     icon: Target          },
    { key: "prices",      label: "Energy Prices",         icon: DollarSign      },
    { key: "weather",     label: "Weather",               icon: CloudSun        },
    {
      key:   "messages",
      label: "Messages",
      icon:  MessagesSquare,
      badge: messageNotifCount,
    },
    { key: "profile",     label: "My Profile",            icon: UserCircle2     },
  ];

  if (currentUser?.role === "admin") {
    items.push({ key: "users",      label: "Users Management",  icon: Users             });
    items.push({ key: "thresholds", label: "Alarm Thresholds",  icon: SlidersHorizontal });
    items.push({
      key:   "urgent",
      label: "Urgent Messages",
      icon:  BellRing,
      badge: urgentCount,
    });
    items.push({ key: "audit",      label: "Audit Logs",        icon: ClipboardList     });
  }

  return (
    <div className={`sidebar ${sidebarOpen ? "open" : "closed"}`}>
      <div className="sidebar-top">
        {sidebarOpen && <h2> EMS</h2>}
        <button className="sidebar-toggle-btn"
          onClick={() => setSidebarOpen(prev => !prev)} type="button">
          {sidebarOpen ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
        </button>
      </div>

      <ul>
        {items.map(item => {
          const Icon = item.icon;
          return (
            <li key={item.key}
              className={activePage === item.key ? "active" : ""}
              onClick={() => setActivePage(item.key)}
              title={item.label}>
              <div className="sidebar-item">
                <Icon size={18} className="sidebar-icon" />
                {sidebarOpen && <span>{item.label}</span>}
                {sidebarOpen && item.badge > 0 && (
                  <span className="sidebar-notification-badge">{item.badge}</span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}