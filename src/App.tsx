import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  onAuthStateChanged, 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut,
  User
} from 'firebase/auth';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  doc, 
  getDoc, 
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  Timestamp,
  orderBy
} from 'firebase/firestore';
import { auth, db } from './firebase';
import { 
  Academy, 
  Athlete, 
  Registration, 
  UserProfile, 
  OperationType,
  Transaction
} from './types';
import { handleFirestoreError, getAgeCategory, getWeightCategory, calculatePrice, generatePix, formatWhatsAppNumber } from './utils';
import { PREDEFINED_ACADEMIES, BELT_OPTIONS } from './constants';
import { ErrorBoundary } from './components/ErrorBoundary';
import { 
  Users, 
  UserPlus, 
  Trophy, 
  LogOut, 
  Plus, 
  ChevronRight, 
  Shield, 
  School, 
  Calendar,
  CheckCircle2,
  Clock,
  AlertCircle,
  Search,
  Filter,
  Trash2,
  Edit,
  Camera,
  MapPin,
  CreditCard,
  FileText,
  CheckCircle,
  Copy,
  ExternalLink,
  Medal,
  Menu,
  X
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { motion, AnimatePresence } from 'motion/react';
import { Button, Card, Input, Select, cn } from './components/ui';
import { BeltBadge } from './components/BeltBadge';
import { AdminView } from './components/views/AdminView';
import { RegistrationsView } from './components/views/RegistrationsView';
import { AthletesView } from './components/views/AthletesView';
import { AcademyView } from './components/views/AcademyView';
import { ProfileView } from './components/views/ProfileView';
import { CompetitionView } from './components/views/CompetitionView';
import { RankingView } from './components/views/RankingView';
import { DashboardView, TributeCard } from './components/views/DashboardView';
import { CourtView } from './components/views/CourtView';
import { JoinView } from './components/views/JoinView';
import { ArenaCallPanel } from './components/views/ArenaCallPanel';


const UNIAO_LOPES_LOGO = "/logo-colombo.png";

// Funções PIX e WhatsApp foram movidas para src/utils.ts

// --- Main App ---

type ViewMode = 'dashboard' | 'academy' | 'athletes' | 'registrations' | 'competition' | 'ranking' | 'admin' | 'profile' | 'court' | 'join' | 'call-panel';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [authInitialized, setAuthInitialized] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [loadingTimeout, setLoadingTimeout] = useState(false);
  const [view, setView] = useState<ViewMode>(() => {
    // 1. Prioridade máxima: Parâmetros da URL (prevenir flash do dashboard)
    const params = new URLSearchParams(window.location.search);
    if (params.get('session')) return 'court';
    if (params.get('join') === 'arena' || params.get('arena') === 'arena') return 'join';
    if (params.get('join') === 'panel' || params.get('arena') === 'panel') return 'call-panel';

    // 2. Fallback: localStorage
    const saved = localStorage.getItem('last_view');
    return (saved as ViewMode) || 'dashboard';
  });

  const [viewParams, setViewParams] = useState<any>(() => {
    const params = new URLSearchParams(window.location.search);
    const session = params.get('session');
    if (session) return { sessionId: session };

    const saved = localStorage.getItem('last_view_params');
    return saved ? JSON.parse(saved) : null;
  });
  
  const navigateTo = (newView: ViewMode, params?: any) => {
    setView(newView);
    setViewParams(params);
    localStorage.setItem('last_view', newView);
    if (params) {
      localStorage.setItem('last_view_params', JSON.stringify(params));
    } else {
      localStorage.removeItem('last_view_params');
    }
  };

  const [academies, setAcademies] = useState<Academy[]>([]);
  const [athletes, setAthletes] = useState<Athlete[]>([]);
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [receipts, setReceipts] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [settings, setSettings] = useState<any>({ mercadoPagoEnabled: true });
  const [viewingReceipt, setViewingReceipt] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  useEffect(() => {
    document.title = "3º Festival União Lopes - Portal";

    // Handle Court Kiosk mode via URL params
    const params = new URLSearchParams(window.location.search);
    const sessionToken = params.get('session');
    const joinParam = params.get('join');
    const arenaParam = params.get('arena');
    
    const isJoin = joinParam === 'true' || joinParam === 'arena' || arenaParam === 'true' || arenaParam === 'arena' || window.location.pathname === '/join';
    
    if (sessionToken && view !== 'court') {
      console.log("🚀 Sessão PRIORIZADA via URL:", sessionToken);
      navigateTo('court', { sessionId: sessionToken });
    } else if (params.get('join') === 'panel' && view !== 'call-panel') {
      navigateTo('call-panel');
    } else if (isJoin && view !== 'join') {
      console.log("🚀 Entrando no Portal da Arena via URL");
      navigateTo('join');
    }
    
  }, [loading, window.location.search]);

  // Safety timeout to prevent infinite loading
  useEffect(() => {
    const timer = setTimeout(() => {
      if (loading) {
        console.warn("Loading timeout reached. Forcing loading state to false.");
        setLoadingTimeout(true);
        setLoading(false);
      }
    }, 12000);
    return () => clearTimeout(timer);
  }, [loading]);

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      console.log("Auth state changed:", firebaseUser?.uid || 'no user');
      setUser(firebaseUser);
      setAuthInitialized(true);
      if (firebaseUser) {
        if (firebaseUser.isAnonymous) {
          setProfile(null);
          setLoading(false);
          return;
        }

        try {
          // Admin check by email whitelist
          const adminEmails = ['leo@laravitoria.com', 'tauyllin.edfisica@hotmail.com', 'tauyllin.tkd@gmail.com', 'carloswalesko@gmail.com'];
          const isSystemAdmin = adminEmails.includes(firebaseUser.email || '');

          // Profile Listener (v2: onSnapshot with auto-upgrade/auto-link)
          const profileUnsubscribe = onSnapshot(doc(db, 'users', firebaseUser.uid), async (snap) => {
            if (snap.exists()) {
              const userData = snap.data() as UserProfile;
              // Upgrade existing user if they are in the admin whitelist
              if (isSystemAdmin && userData.role !== 'admin') {
                await updateDoc(doc(db, 'users', firebaseUser.uid), { role: 'admin' });
                setProfile({ ...userData, uid: firebaseUser.uid, role: 'admin' });
              } else {
                setProfile({ uid: firebaseUser.uid, ...userData });
              }
            } else {
              // Create new profile for first-time use
              const newProfile: UserProfile = {
                uid: firebaseUser.uid,
                email: firebaseUser.email || '',
                role: isSystemAdmin ? 'admin' : 'master',
                displayName: firebaseUser.displayName || '',
                photoURL: firebaseUser.photoURL || ''
              };
              await setDoc(doc(db, 'users', firebaseUser.uid), newProfile);
              setProfile(newProfile);
            }
            setLoading(false);
          }, (err) => {
            console.error("Profile onSnapshot error:", err);
            setLoading(false);
          });
          
          return () => profileUnsubscribe();
        } catch (err) {
          handleFirestoreError(err, OperationType.GET, 'users');
          setLoading(false);
        }
      } else {
        setProfile(null);
        setLoading(false);
      }
    });
    return unsubscribe;
  }, []);

  // Redirecionamento de segurança para Master sem Academia
  useEffect(() => {
    if (profile?.role === 'master' && !profile.academyId && view !== 'academy' && view !== 'profile' && view !== 'court') {
      console.log("Master sem academia detectado. Redirecionando para config.");
      setView('academy');
    }
  }, [profile, view]);

  // Data Listeners — CORRIGIDO: listeners separados por coleção para evitar re-subscrição em cascata
  // O listener de registrations/receipts usa uma ref para capturar academies sem ser dependência
  const academiesRef = useRef(academies);
  useEffect(() => { academiesRef.current = academies; }, [academies]);

  // Academies + Athletes + Settings: dependem apenas do profile
  useEffect(() => {
    if (!profile) return;
    const listeners: (() => void)[] = [];

    const qAcademies = profile.role === 'admin'
      ? collection(db, 'academies')
      : query(collection(db, 'academies'), where('createdBy', '==', profile.uid));
    listeners.push(onSnapshot(qAcademies, (snap) => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as Academy));
      setAcademies(data);
      
      // Auto-vínculo para Master: se já tem academia criada mas não está no doc 'users'
      if (profile.role === 'master' && !profile.academyId && data.length > 0) {
        console.log("Detectado academia órfã. Vinculando automaticamente ao perfil.");
        updateDoc(doc(db, 'users', profile.uid), { academyId: data[0].id });
      }
    }, (err) => {
      try { handleFirestoreError(err, OperationType.LIST, 'academies'); } catch (e) { setError(e as Error); }
    }));

    const qAthletes = profile.role === 'admin'
      ? collection(db, 'athletes')
      : query(collection(db, 'athletes'), where('academyId', '==', profile.academyId || 'none'));
    listeners.push(onSnapshot(qAthletes, (snap) => {
      setAthletes(snap.docs.map(d => ({ id: d.id, ...d.data() } as Athlete)));
    }, (err) => {
      try { handleFirestoreError(err, OperationType.LIST, 'athletes'); } catch (e) { setError(e as Error); }
    }));

    listeners.push(onSnapshot(doc(db, 'settings', 'payment'), (snap) => {
      setSettings(snap.exists() ? snap.data() : { mercadoPagoEnabled: true });
    }, (err) => {
      try { handleFirestoreError(err, OperationType.GET, 'settings'); } catch (e) { setError(e as Error); }
    }));

    return () => listeners.forEach(l => l());
  }, [profile]);

  // Registrations + Receipts: para usuários não-admin dependem da lista de acadmias
  // Listener recriado sempre que a lista de IDs de academias muda
  const academyIdsString = academies.map(a => a.id).sort().join(',');
  useEffect(() => {
    if (!profile) return;
    const listeners: (() => void)[] = [];

    const buildQuery = (colName: string) => {
      if (profile.role === 'admin') return collection(db, colName);
      const ids = academies.map(a => a.id);
      return query(collection(db, colName), where('academyId', 'in', ids.length > 0 ? ids : ['none']));
    };

    listeners.push(onSnapshot(buildQuery('registrations'), (snap) => {
      setRegistrations(snap.docs.map(d => ({ id: d.id, ...d.data() } as Registration)));
    }, (err) => {
      try { handleFirestoreError(err, OperationType.LIST, 'registrations'); } catch (e) { setError(e as Error); }
    }));

    listeners.push(onSnapshot(buildQuery('receipts'), (snap) => {
      setReceipts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (err) => {
      try { handleFirestoreError(err, OperationType.LIST, 'receipts'); } catch (e) { setError(e as Error); }
    }));

    listeners.push(onSnapshot(buildQuery('transactions'), (snap) => {
      setTransactions(snap.docs.map(d => ({ id: d.id, ...d.data() } as Transaction)));
    }, (err) => {
      try { handleFirestoreError(err, OperationType.LIST, 'transactions'); } catch (e) { setError(e as Error); }
    }));

    return () => listeners.forEach(l => l());
  }, [profile, academyIdsString]);

  const handleLogin = async () => {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (error: any) {
      console.error('Login error:', error);
      alert(`Erro no Login: ${error.message || error.code || 'Desconhecido'}\n\nPossíveis causas:\n1. Bloqueador de Popup ativado.\n2. Domínio não autorizado no Firebase.\nVerifique o painel F12 para detalhes técnicos.`);
    }
  };

  const handleLogout = () => signOut(auth);

  if (error) {
    throw error;
  }

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-stone-950 gap-8">
        <div className="relative w-16 h-16">
          <div className="absolute inset-0 border-4 border-white/5 rounded-full" />
          <div className="absolute inset-0 border-4 border-red-600 rounded-full border-t-transparent animate-spin" />
        </div>
        {loadingTimeout && (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center space-y-6 max-w-sm px-6"
          >
            <div className="space-y-2">
              <p className="text-white font-black uppercase tracking-tighter text-xl italic italic leading-none">Conector Recusado</p>
              <p className="text-stone-500 text-[10px] uppercase font-bold tracking-widest leading-relaxed">
                Não foi possível estabelecer conexão com o Firebase. Verifique se o seu domínio está autorizado no console.
              </p>
            </div>
            <Button 
              onClick={() => window.location.reload()} 
              variant="secondary" 
              className="w-full py-4 text-[10px] font-black uppercase tracking-[0.2em]"
            >
              Reiniciar Conector
            </Button>
          </motion.div>
        )}
      </div>
    );
  }

  if (!user && view !== 'court' && view !== 'join') {
    return (
      <div className="min-h-screen flex bg-stone-900 font-sans selection:bg-red-500 selection:text-white">
        {/* Left Side - Poster Concept */}
        <div className="hidden lg:flex lg:w-3/5 relative overflow-hidden items-center justify-center border-r border-white/10">
          <div className="absolute inset-0 z-0 bg-stone-950">
            {/* Dynamic Gradients */}
            <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_0%_0%,_rgba(220,38,38,0.4)_0%,_transparent_50%)]" />
            <div className="absolute bottom-0 right-0 w-full h-full bg-[radial-gradient(circle_at_100%_100%,_rgba(37,99,235,0.4)_0%,_transparent_50%)]" />
            
            <img 
              src="/poster.jpg" 
              alt="Background" 
              className="w-full h-full object-cover opacity-40 mix-blend-luminosity brightness-75 contrast-125 grayscale-[20%]"
              onError={(e) => { e.currentTarget.src = "https://images.unsplash.com/photo-1555597673-b21d5c935865?auto=format&fit=crop&q=80" }}
            />
            
            {/* Slash overlay effect */}
            <div className="absolute inset-0" style={{ backgroundImage: 'linear-gradient(105deg, transparent 40%, rgba(220,38,38,0.1) 45%, rgba(37,99,235,0.1) 55%, transparent 60%)' }} />
            <div className="absolute inset-0 bg-stone-900/60" />
            <div className="absolute inset-0 bg-gradient-to-t from-stone-950 via-stone-900/50 to-transparent" />
          </div>
          
          <div className="relative z-10 w-full max-w-2xl p-12 text-center space-y-10">
            <motion.div 
              initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.5 }}
              className="w-48 h-48 mx-auto flex items-center justify-center rounded-full overflow-hidden shadow-[0_0_50px_rgba(220,38,38,0.3)] border-4 border-white/5 bg-white/10 backdrop-blur-xl p-4"
            >
              <img src={settings?.festivalLogo || "/logo-colombo.png"} alt="Associação Colombo de Taekwondo Logo" className="w-full h-full object-contain drop-shadow-2xl" onError={(e) => { e.currentTarget.src = UNIAO_LOPES_LOGO }} />
            </motion.div>
            
            <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.2, duration: 0.6 }} className="space-y-2">
              <h1 className="text-6xl md:text-7xl font-black tracking-tighter text-white uppercase italic drop-shadow-[0_4px_20px_rgba(220,38,38,0.5)]">
                3º FESTIVAL<br/>
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-red-500 to-red-600 drop-shadow-[0_2px_2px_rgba(0,0,0,0.8)] filter">UNIÃO LOPES</span>
              </h1>
              <p className="text-4xl font-black text-white uppercase tracking-widest drop-shadow-xl italic mt-2">TAEKWONDO</p>
              
              <div className="flex items-center justify-center gap-6 py-6 w-3/4 mx-auto">
                 <div className="h-1 flex-1 bg-red-600 rounded-full shadow-[0_0_10px_rgba(220,38,38,0.8)]" />
                 <p className="text-xl text-white font-black tracking-widest uppercase italic">E FILIADOS 2026</p>
                 <div className="h-1 flex-1 bg-blue-600 rounded-full shadow-[0_0_10px_rgba(37,99,235,0.8)]" />
              </div>
            </motion.div>

            <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.4, duration: 0.6 }} className="grid grid-cols-2 gap-4 text-left">
              <div className="bg-white/5 backdrop-blur-md p-6 rounded-2xl border border-white/10 shadow-2xl hover:bg-white/10 transition-colors">
                <Calendar className="w-8 h-8 text-red-500 mb-4" />
                <p className="text-white font-black text-xl mb-1">12 DE ABRIL</p>
                <p className="text-stone-400 text-sm font-medium">Domingo, 08h às 19h</p>
              </div>
              <div className="bg-white/5 backdrop-blur-md p-6 rounded-2xl border border-white/10 shadow-2xl hover:bg-white/10 transition-colors">
                <MapPin className="w-8 h-8 text-blue-500 mb-4" />
                <p className="text-white font-black text-xl mb-1">COLOMBO / PR</p>
                <p className="text-stone-400 text-sm font-medium leading-tight">Colégio E.C.M. Alfredo Chaves<br/>Rio Verde</p>
              </div>
            </motion.div>

            <div className="pt-8 text-left">
              <TributeCard settings={settings} />
            </div>
          </div>
        </div>

        {/* Right Side - Login Form (Glassmorphism dark mode) */}
        <div className="flex-1 flex flex-col items-center justify-center p-6 bg-stone-950 relative overflow-hidden">
          {/* Subtle noise/texture for the right side */}
          <div className="absolute inset-0 bg-[url('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADIAAAAyBAMAAADsEZWCAAAAGFBMVEVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUU9pYm6AAAAB3RSTlMAAAAAAAAAlXisGAAAACJJREFUKM9jGAWjYBSMglEwCkbBKJgFomAUjIJRMApGwSgAAByXAE99v99cAAAAAElFTkSuQmCC')] opacity-5 mix-blend-overlay z-0"></div>
          
          <motion.div 
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5 }}
            className="max-w-md w-full text-center space-y-8 relative z-10"
          >
            <div className="lg:hidden space-y-6">
              <div className="w-32 h-32 mx-auto flex items-center justify-center rounded-full overflow-hidden shadow-[0_0_30px_rgba(220,38,38,0.4)] border-2 border-white/20 bg-stone-900 p-2">
                <img src={settings?.festivalLogo || "/logo-colombo.png"} alt="Logo" className="w-full h-full object-contain" onError={(e) => { e.currentTarget.src = UNIAO_LOPES_LOGO }} />
              </div>
              <div>
                <h1 className="text-4xl font-black tracking-tighter text-white uppercase italic">3º FESTIVAL<br/><span className="text-red-500">UNIÃO LOPES</span></h1>
                <p className="text-stone-400 font-bold tracking-widest uppercase mt-2">TAEKWONDO 2026</p>
              </div>
            </div>

            <div className="space-y-3 hidden lg:block text-left">
              <h2 className="text-4xl font-black text-white tracking-tight uppercase">Portal de Inscrições</h2>
              <p className="text-stone-400 text-lg">Acesso exclusivo para Professores Regulamentados</p>
            </div>

            <Card className="p-8 space-y-8 bg-stone-900/60 backdrop-blur-2xl border border-white/10 shadow-2xl">
              <div className="space-y-4">
                <div className="w-20 h-20 bg-gradient-to-br from-red-500/20 to-blue-500/20 rounded-3xl flex items-center justify-center mx-auto mb-8 border border-white/5 shadow-[inset_0_0_20px_rgba(255,255,255,0.05)]">
                  <Shield className="w-10 h-10 text-red-500" />
                </div>
                <p className="text-stone-300 text-sm leading-relaxed pb-4">
                  Bem-vindo ao sistema de gestão oficial do festival. Autentique-se com sua conta Google vinculada para acessar sua academia, atletas e comprovantes.
                </p>
              </div>
              <Button onClick={handleLogin} className="w-full py-6 text-lg bg-red-600 hover:bg-red-500 text-white shadow-[0_0_20px_rgba(220,38,38,0.4)] hover:shadow-[0_0_30px_rgba(220,38,38,0.6)] transition-all hover:scale-[1.02] border border-red-500/50 font-bold uppercase tracking-wider">
                Acessar Sistema
              </Button>
            </Card>

            <div className="flex items-center justify-center gap-2 text-stone-500 text-sm font-medium">
              <Shield className="w-4 h-4" />
              <span>Ambiente Seguro • Associação Colombo de Taekwondo</span>
            </div>
          </motion.div>
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-stone-950 flex font-sans selection:bg-red-600 selection:text-white overflow-hidden relative">
        {/* Background Accents */}
        <div className="fixed inset-0 z-0 pointer-events-none">
          <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-red-600/10 rounded-full blur-[120px]" />
          <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-blue-600/10 rounded-full blur-[120px]" />
          <div className="absolute inset-0 bg-[url('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADIAAAAyBAMAAADsEZWCAAAAGFBMVEVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUU9pYm6AAAAB3RSTlMAAAAAAAAAlXisGAAAACJJREFUKM9jGAWjYBSMglEwCkbBKJgFomAUjIJRMApGwSgAAByXAE99v99cAAAAAElFTkSuQmCC')] opacity-5 mix-blend-overlay" />
        </div>

        {/* Mobile Header */}
        {view !== 'court' && view !== 'join' && view !== 'call-panel' && (
          <header className="fixed top-0 left-0 right-0 h-16 bg-stone-900/80 backdrop-blur-xl border-b border-white/5 flex items-center justify-between px-6 z-[60] md:hidden">
            <div className="flex items-center gap-3">
              <img src={settings?.festivalLogo || UNIAO_LOPES_LOGO} alt="Logo" className="w-8 h-8 object-contain" />
              <h2 className="text-xs font-black text-white uppercase italic tracking-tighter">Portal União Lopes</h2>
            </div>
            <button 
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="p-2 rounded-xl bg-white/5 border border-white/10 text-white"
            >
              {isSidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </header>
        )}

        {/* Sidebar Backdrop (Mobile) */}
        {view !== 'court' && view !== 'join' && view !== 'call-panel' && isSidebarOpen && (
          <div 
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[70] md:hidden"
            onClick={() => setIsSidebarOpen(false)}
          />
        )}

        {/* Sidebar */}
        {view !== 'court' && view !== 'join' && view !== 'call-panel' && (
        <aside className={cn(
          "fixed inset-y-0 left-0 w-72 bg-stone-900 border-r border-white/5 flex flex-col z-[80] transition-transform duration-300 md:relative md:translate-x-0 md:bg-stone-900/40 md:backdrop-blur-3xl",
          isSidebarOpen ? "translate-x-0 shadow-[20px_0_50px_rgba(0,0,0,0.5)]" : "-translate-x-full"
        )}>
          <div className="p-8 border-b border-white/5 flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-white/5 p-2 border border-white/10 shadow-xl overflow-hidden shrink-0">
              <img src={settings?.festivalLogo || UNIAO_LOPES_LOGO} alt="Logo" className="w-full h-full object-contain" />
            </div>
            <div>
              <h2 className="font-black text-white leading-tight italic tracking-tight uppercase">3º Festival</h2>
              <p className="text-[10px] text-red-500 font-black uppercase tracking-[0.2em]">União Lopes</p>
            </div>
          </div>

          <nav className="flex-1 p-4 space-y-2">
            <NavItem active={view === 'dashboard'} onClick={() => { navigateTo('dashboard'); setIsSidebarOpen(false); }} icon={<Users className="w-5 h-5" />} label="Dashboard" />
            <NavItem active={view === 'academy'} onClick={() => { navigateTo('academy'); setIsSidebarOpen(false); }} icon={<School className="w-5 h-5" />} label="Minha Academia" />
            <NavItem active={view === 'athletes'} onClick={() => { navigateTo('athletes'); setIsSidebarOpen(false); }} icon={<UserPlus className="w-5 h-5" />} label="Atletas" />
            <NavItem active={view === 'registrations'} onClick={() => { navigateTo('registrations'); setIsSidebarOpen(false); }} icon={<Calendar className="w-5 h-5" />} label="Inscrições" />
            <NavItem active={view === 'competition'} onClick={() => { navigateTo('competition'); setIsSidebarOpen(false); }} icon={<Trophy className="w-5 h-5" />} label="Chaves" />
            {profile?.role === 'admin' && (
              <NavItem active={view === 'ranking'} onClick={() => { navigateTo('ranking'); setIsSidebarOpen(false); }} icon={<Medal className="w-5 h-5" />} label="Ranking" />
            )}
            {profile?.role === 'admin' && (
              <NavItem active={view === 'admin'} onClick={() => { navigateTo('admin'); setIsSidebarOpen(false); }} icon={<Shield className="w-5 h-5" />} label="Administração" />
            )}
          </nav>

          <div className="p-6 border-t border-white/5 space-y-4">
            <button 
              onClick={() => setView('profile')}
              className="w-full flex items-center gap-3 p-3 rounded-2xl hover:bg-white/5 transition-all text-stone-400 hover:text-white group border border-transparent hover:border-white/10"
            >
              <div className="w-10 h-10 rounded-xl bg-stone-800 overflow-hidden border border-white/5 shadow-inner">
                {user?.photoURL && <img src={user.photoURL} alt="User" className="w-full h-full object-cover" />}
              </div>
              <div className="text-left overflow-hidden">
                <p className="text-sm font-black text-white truncate leading-tight uppercase tracking-tighter">{user?.displayName}</p>
                <p className="text-[10px] text-stone-500 uppercase font-bold tracking-widest">Configurações</p>
              </div>
            </button>
            <button 
              onClick={() => signOut(auth)}
              className="w-full flex items-center gap-3 px-5 py-4 rounded-xl bg-red-600 text-white hover:bg-red-500 transition-all font-black text-[10px] uppercase tracking-[0.2em] shadow-lg shadow-red-600/20"
            >
              <LogOut className="w-4 h-4" />
              <span>Sair do Sistema</span>
            </button>

            <div className="pt-4 mt-4 border-t border-white/5 space-y-4">
              <div className="flex flex-col items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/5 p-1 border border-white/10 opacity-60">
                  <img src={settings?.festivalLogo || UNIAO_LOPES_LOGO} alt="Realização" className="w-full h-full object-contain" />
                </div>
                <div className="text-center space-y-1">
                  <p className="text-[9px] text-stone-500 font-black uppercase tracking-widest leading-tight">Realização</p>
                  <p className="text-[10px] text-stone-400 font-bold uppercase tracking-tighter">Associação Colombo de Taekwondo</p>
                </div>
              </div>
              
              <div className="flex items-center justify-center gap-2 py-2 px-4 rounded-lg bg-stone-900/50 border border-white/5">
                <Shield className="w-3 h-3 text-red-500/50" />
                <span className="text-[9px] font-black text-stone-600 uppercase tracking-[0.2em] italic">Indomitable Spirit Data Lab</span>
              </div>
            </div>
          </div>
        </aside>
        )}

        {/* Main Content */}
        <main className={cn(
          "flex-1 overflow-y-auto z-40 relative",
          (view !== 'court' && view !== 'join' && view !== 'call-panel') && "pt-16 md:pt-0"
        )}>
          <div className={cn(
            (view !== 'court' && view !== 'join' && view !== 'call-panel') ? "p-4 sm:p-6 lg:p-12" : "p-0"
          )}>
            <div className="max-w-7xl mx-auto space-y-8 md:space-y-12">
              {view !== 'court' && view !== 'join' && view !== 'call-panel' && (
                <header className="flex items-center justify-between pb-8 border-b border-white/5">
                  <div>
                    <h1 className="text-3xl font-black text-white uppercase italic tracking-tighter leading-none">
                      {view === 'dashboard' && 'Visão Geral'}
                      {view === 'academy' && 'Minha Academia'}
                      {view === 'athletes' && 'Gestão de Atletas'}
                      {view === 'registrations' && 'Inscrições Ativas'}
                      {view === 'competition' && 'Chaves de Competição'}
                      {view === 'ranking' && 'Ranking'}
                      {view === 'admin' && 'Painel Administrativo'}
                      {view === 'profile' && 'Configurações de Perfil'}
                    </h1>
                    <p className="text-stone-500 text-sm font-bold uppercase tracking-widest mt-2 flex items-center gap-2">
                      <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                      Portal Fest 2026 • Ambiente Seguro
                    </p>
                  </div>
                </header>
              )}

              <AnimatePresence mode="wait">
                {view === 'dashboard' && <DashboardView key="dashboard" profile={profile} stats={{ academies: academies.length, athletes: athletes.length, registrations: registrations.length }} settings={settings} academies={academies} registrations={registrations} athletes={athletes} onNavigate={navigateTo} />}
                {view === 'academy' && <AcademyView key="academy" profile={profile} academies={academies} />}
                {view === 'athletes' && <AthletesView key="athletes" profile={profile} user={user} athletes={athletes} academies={academies} registrations={registrations} />}
                {view === 'registrations' && <RegistrationsView key="registrations" profile={profile} registrations={registrations} athletes={athletes} academies={academies} receipts={receipts} settings={settings} transactions={transactions} onViewReceipt={setViewingReceipt} initialAthleteId={viewParams?.athleteId} />}
                {view === 'competition' && <CompetitionView key="competition" profile={profile} user={user} registrations={registrations} athletes={athletes} academies={academies} />}
                {view === 'ranking' && <RankingView key="ranking" academies={academies} registrations={registrations} />}
                {view === 'admin' && <AdminView key="admin" profile={profile} user={user} registrations={registrations} athletes={athletes} academies={academies} receipts={receipts} transactions={transactions} settings={settings} onViewReceipt={setViewingReceipt} />}
                {view === 'profile' && <ProfileView key="profile" profile={profile} user={user} />}
                {view === 'court' && <CourtView key="court" sessionId={viewParams?.sessionId} user={user} profile={profile} authInitialized={authInitialized} deviceId={viewParams?.deviceId} />}
                {view === 'join' && <JoinView key="join" onNavigate={navigateTo} />}
                {view === 'call-panel' && <ArenaCallPanel key="call-panel" />}
              </AnimatePresence>
            </div>
          </div>
        </main>
      </div>

      {viewingReceipt && (
        <div 
          className="fixed inset-0 z-[9999] bg-black/95 backdrop-blur-xl flex items-center justify-center p-6 md:p-20 transition-all" 
          onClick={() => setViewingReceipt(null)}
        >
          <div className="relative max-w-5xl w-full h-full flex items-center justify-center">
             <button className="absolute -top-12 right-0 text-white hover:text-red-500 transition-colors flex items-center gap-2 font-black uppercase tracking-widest text-[10px]" onClick={() => setViewingReceipt(null)}>
               Fechar [X]
             </button>
             <img 
               src={viewingReceipt} 
               alt="Comprovante" 
               className="max-w-full max-h-full rounded-2xl shadow-2xl object-contain border border-white/10" 
               onClick={e => e.stopPropagation()}
             />
          </div>
        </div>
      )}
    </ErrorBoundary>
  );
}

// --- Sub-Views ---

function NavItem({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-3 px-5 py-4 rounded-2xl text-xs font-black uppercase tracking-widest transition-all group relative overflow-hidden',
        active 
          ? 'bg-red-600 text-white shadow-[0_0_20px_rgba(220,38,38,0.3)] border border-red-500/50' 
          : 'text-stone-400 hover:bg-white/5 hover:text-white border border-transparent hover:border-white/5'
      )}
    >
      <span className={cn(
        "transition-colors relative z-10",
        active ? "text-white" : "text-stone-500 group-hover:text-red-500"
      )}>{icon}</span>
      <span className="relative z-10">{label}</span>
      {active && <motion.div layoutId="active-nav" className="ml-auto w-1.5 h-1.5 bg-white rounded-full shadow-[0_0_10px_#fff] relative z-10" />}
    </button>
  );
}

// Dashboard components extracted to DashboardView.tsx









