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
  OperationType 
} from './types';
import { handleFirestoreError, getAgeCategory, getWeightCategory } from './utils';
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
  MapPin
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Components ---

const Button = ({ 
  children, 
  className, 
  variant = 'primary', 
  ...props 
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' | 'ghost' }) => {
  const variants = {
    primary: 'bg-red-600 text-white hover:bg-red-700',
    secondary: 'bg-white text-stone-900 border border-stone-200 hover:bg-stone-50',
    danger: 'bg-red-600 text-white hover:bg-red-700',
    ghost: 'bg-transparent text-stone-600 hover:bg-stone-100'
  };

  return (
    <button 
      className={cn(
        'px-4 py-2 rounded-xl font-medium transition-all flex items-center justify-center gap-2 disabled:opacity-50',
        variants[variant],
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
};

const Card = ({ children, className, key }: { children: React.ReactNode; className?: string; key?: string }) => (
  <div className={cn('bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden', className)}>
    {children}
  </div>
);

const Input = ({ label, error, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string }) => (
  <div className="space-y-1.5 w-full">
    <label className="text-sm font-medium text-stone-700">{label}</label>
    <input 
      className={cn(
        'w-full px-4 py-2.5 rounded-xl border border-stone-200 focus:ring-2 focus:ring-stone-900/10 focus:border-stone-900 outline-none transition-all',
        error && 'border-red-500 focus:ring-red-500/10 focus:border-red-500'
      )}
      {...props}
    />
    {error && <p className="text-xs text-red-500 font-medium">{error}</p>}
  </div>
);

const Select = ({ label, options, error, ...props }: React.SelectHTMLAttributes<HTMLSelectElement> & { label: string; options: { value: string; label: string }[]; error?: string }) => (
  <div className="space-y-1.5 w-full">
    <label className="text-sm font-medium text-stone-700">{label}</label>
    <select 
      className={cn(
        'w-full px-4 py-2.5 rounded-xl border border-stone-200 focus:ring-2 focus:ring-stone-900/10 focus:border-stone-900 outline-none transition-all bg-white',
        error && 'border-red-500 focus:ring-red-500/10 focus:border-red-500'
      )}
      {...props}
    >
      <option value="">Selecione...</option>
      {options.map(opt => (
        <option key={opt.value} value={opt.value}>{opt.label}</option>
      ))}
    </select>
    {error && <p className="text-xs text-red-500 font-medium">{error}</p>}
  </div>
);

const UNIAO_LOPES_LOGO = "/logo-colombo.svg";

const formatWhatsAppNumber = (phone: string) => {
  let cleaned = phone.replace(/\D/g, '');
  if (cleaned.startsWith('550')) {
    cleaned = '55' + cleaned.substring(3);
  } else if (cleaned.startsWith('0')) {
    cleaned = cleaned.substring(1);
  }
  return cleaned.startsWith('55') ? cleaned : `55${cleaned}`;
};

// --- Main App ---

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [view, setView] = useState<'dashboard' | 'athletes' | 'registrations' | 'academy' | 'admin' | 'profile'>('dashboard');
  
  const [academies, setAcademies] = useState<Academy[]>([]);
  const [athletes, setAthletes] = useState<Athlete[]>([]);
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [receipts, setReceipts] = useState<any[]>([]);
  const [settings, setSettings] = useState<any>({ mercadoPagoEnabled: true });

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        try {
          const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
          if (userDoc.exists()) {
            setProfile({ uid: firebaseUser.uid, ...userDoc.data() } as UserProfile);
          } else {
            // New user defaults to master
            const newProfile: UserProfile = {
              uid: firebaseUser.uid,
              email: firebaseUser.email || '',
              role: firebaseUser.email === 'leo@laravitoria.com' ? 'admin' : 'master',
              displayName: firebaseUser.displayName || '',
              photoURL: firebaseUser.photoURL || ''
            };
            await setDoc(doc(db, 'users', firebaseUser.uid), newProfile);
            setProfile(newProfile);
          }
        } catch (err) {
          try {
            handleFirestoreError(err, OperationType.GET, 'users');
          } catch (e) {
            setError(e as Error);
          }
        } finally {
          setLoading(false);
        }
      } else {
        setProfile(null);
        setLoading(false);
      }
    });
    return unsubscribe;
  }, []);

  // Data Listeners
  useEffect(() => {
    if (!profile) return;

    const listeners: (() => void)[] = [];

    // Academies
    const qAcademies = profile.role === 'admin' 
      ? collection(db, 'academies')
      : query(collection(db, 'academies'), where('createdBy', '==', profile.uid));
    
    listeners.push(onSnapshot(qAcademies, (snap) => {
      setAcademies(snap.docs.map(d => ({ id: d.id, ...d.data() } as Academy)));
    }, (err) => {
      try { handleFirestoreError(err, OperationType.LIST, 'academies'); } catch (e) { setError(e as Error); }
    }));

    // Athletes
    const qAthletes = profile.role === 'admin'
      ? collection(db, 'athletes')
      : query(collection(db, 'athletes'), where('createdBy', '==', profile.uid));
    
    listeners.push(onSnapshot(qAthletes, (snap) => {
      setAthletes(snap.docs.map(d => ({ id: d.id, ...d.data() } as Athlete)));
    }, (err) => {
      try { handleFirestoreError(err, OperationType.LIST, 'athletes'); } catch (e) { setError(e as Error); }
    }));

    // Registrations
    const qRegs = profile.role === 'admin'
      ? collection(db, 'registrations')
      : query(collection(db, 'registrations'), where('academyId', 'in', academies.length > 0 ? academies.map(a => a.id) : ['none']));

    listeners.push(onSnapshot(qRegs, (snap) => {
      setRegistrations(snap.docs.map(d => ({ id: d.id, ...d.data() } as Registration)));
    }, (err) => {
      try { handleFirestoreError(err, OperationType.LIST, 'registrations'); } catch (e) { setError(e as Error); }
    }));

    // Receipts
    const qReceipts = profile.role === 'admin'
      ? collection(db, 'receipts')
      : query(collection(db, 'receipts'), where('academyId', 'in', academies.length > 0 ? academies.map(a => a.id) : ['none']));

    listeners.push(onSnapshot(qReceipts, (snap) => {
      setReceipts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (err) => {
      try { handleFirestoreError(err, OperationType.LIST, 'receipts'); } catch (e) { setError(e as Error); }
    }));

    // Settings
    listeners.push(onSnapshot(doc(db, 'settings', 'payment'), (snap) => {
      if (snap.exists()) {
        setSettings(snap.data());
      } else {
        setSettings({ mercadoPagoEnabled: true });
      }
    }, (err) => {
      try { handleFirestoreError(err, OperationType.GET, 'settings'); } catch (e) { setError(e as Error); }
    }));

    return () => listeners.forEach(l => l());
  }, [profile, academies.length]);

  const handleLogin = async () => {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error('Login error:', error);
    }
  };

  const handleLogout = () => signOut(auth);

  if (error) {
    throw error;
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-stone-900"></div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex bg-stone-900">
        {/* Left Side - Poster Background */}
        <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden items-center justify-center">
          {/* Background Image with Red/Blue Theme */}
          <div className="absolute inset-0 z-0">
            <div className="absolute inset-0 bg-gradient-to-br from-blue-900 via-stone-900 to-red-900 opacity-80" />
            <img 
              src="https://images.unsplash.com/photo-1555597673-b21d5c935865?auto=format&fit=crop&q=80" 
              alt="Background" 
              className="w-full h-full object-cover opacity-30 mix-blend-overlay"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-stone-900 via-transparent to-transparent" />
          </div>
          
          <div className="relative z-10 w-full max-w-lg p-12 text-center space-y-8">
            <div className="w-40 h-40 mx-auto flex items-center justify-center rounded-full overflow-hidden shadow-2xl shadow-red-600/20 border-4 border-white/10 bg-white/5 backdrop-blur-md p-4">
              <img src={settings?.festivalLogo || UNIAO_LOPES_LOGO} alt="Associação Colombo de Taekwondo Logo" className="w-full h-full object-contain drop-shadow-lg" />
            </div>
            <div className="space-y-4">
              <h1 className="text-5xl font-black tracking-tight text-white uppercase italic drop-shadow-lg">
                3º Festival<br/>
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-red-500 to-red-600">União Lopes</span>
              </h1>
              <p className="text-2xl font-bold text-stone-300 uppercase tracking-widest">Taekwondo</p>
              <p className="text-lg text-stone-400 font-medium tracking-widest border-y border-stone-700 py-2">E Filiados 2026</p>
            </div>

            <div className="grid grid-cols-2 gap-4 text-left pt-8">
              <div className="bg-white/5 backdrop-blur-sm p-4 rounded-xl border border-white/10">
                <Calendar className="w-6 h-6 text-red-500 mb-2" />
                <p className="text-white font-bold">12 de Abril</p>
                <p className="text-stone-400 text-sm">Domingo, 08h às 19h</p>
              </div>
              <div className="bg-white/5 backdrop-blur-sm p-4 rounded-xl border border-white/10">
                <MapPin className="w-6 h-6 text-blue-500 mb-2" />
                <p className="text-white font-bold">Colombo/PR</p>
                <p className="text-stone-400 text-sm">Colégio Alfredo Chaves</p>
              </div>
            </div>

            <div className="pt-8 text-left">
              <TributeCard settings={settings} />
            </div>
          </div>
        </div>

        {/* Right Side - Login Form */}
        <div className="flex-1 flex flex-col items-center justify-center p-6 bg-stone-50 relative">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-md w-full text-center space-y-8 relative z-10"
          >
            <div className="lg:hidden space-y-4">
              <div className="w-24 h-24 mx-auto flex items-center justify-center rounded-full overflow-hidden shadow-xl shadow-red-600/20 border-4 border-white bg-white">
                <img src={settings?.festivalLogo || UNIAO_LOPES_LOGO} alt="Associação Colombo de Taekwondo Logo" className="w-full h-full object-contain" />
              </div>
              <h1 className="text-3xl font-bold tracking-tight text-stone-900">3º Festival União Lopes</h1>
              <p className="text-stone-500 font-medium">Taekwondo e Filiados 2026</p>
            </div>

            <div className="space-y-2 hidden lg:block">
              <h2 className="text-3xl font-bold text-stone-900">Portal de Inscrições</h2>
              <p className="text-stone-500">Acesso exclusivo para Professores e Mestres</p>
            </div>

            <Card className="p-8 space-y-6 shadow-xl border-stone-200/50 bg-white/80 backdrop-blur-xl">
              <div className="space-y-4">
                <div className="w-16 h-16 bg-red-50 rounded-2xl flex items-center justify-center mx-auto mb-6">
                  <Shield className="w-8 h-8 text-red-600" />
                </div>
                <p className="text-stone-600 text-sm leading-relaxed">
                  Bem-vindo ao sistema oficial de inscrições. Faça login com sua conta Google para gerenciar os atletas da sua academia.
                </p>
              </div>
              <Button onClick={handleLogin} className="w-full py-6 text-lg bg-red-600 hover:bg-red-700 text-white shadow-lg shadow-red-600/20 transition-all hover:scale-[1.02]">
                Entrar com Google
              </Button>
            </Card>

            <p className="text-stone-400 text-sm">Associação Colombo Taekwondo</p>
          </motion.div>
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-stone-50 flex">
        {/* Sidebar */}
        <aside className="w-72 bg-white border-r border-stone-200 flex flex-col hidden md:flex">
          <div className="p-6 border-b border-stone-100 flex items-center gap-3">
            <div className="w-12 h-12 rounded-full overflow-hidden border-2 border-stone-100 shrink-0 bg-white">
              <img src={settings?.festivalLogo || UNIAO_LOPES_LOGO} alt="Associação Colombo de Taekwondo Logo" className="w-full h-full object-cover" />
            </div>
            <div>
              <h2 className="font-bold text-stone-900 leading-tight">3º Festival</h2>
              <p className="text-xs text-stone-500 font-medium uppercase tracking-wider">União Lopes 2026</p>
            </div>
          </div>

          <nav className="flex-1 p-4 space-y-2">
            <NavItem active={view === 'dashboard'} onClick={() => setView('dashboard')} icon={<Users className="w-5 h-5" />} label="Dashboard" />
            <NavItem active={view === 'academy'} onClick={() => setView('academy')} icon={<School className="w-5 h-5" />} label="Minha Academia" />
            <NavItem active={view === 'athletes'} onClick={() => setView('athletes')} icon={<UserPlus className="w-5 h-5" />} label="Atletas" />
            <NavItem active={view === 'registrations'} onClick={() => setView('registrations')} icon={<Calendar className="w-5 h-5" />} label="Inscrições" />
            {profile?.role === 'admin' && (
              <NavItem active={view === 'admin'} onClick={() => setView('admin')} icon={<Shield className="w-5 h-5" />} label="Administração" />
            )}
          </nav>

          <div className="p-4 border-t border-stone-100">
            <button 
              onClick={() => setView('profile')}
              className="w-full flex items-center gap-3 p-3 rounded-xl bg-stone-50 mb-4 hover:bg-stone-100 transition-colors text-left"
            >
              <img src={profile?.photoURL || user.photoURL || ''} alt="" className="w-10 h-10 rounded-full border border-stone-200 object-cover" />
              <div className="overflow-hidden">
                <p className="text-sm font-bold text-stone-900 truncate">{profile?.displayName || user.displayName}</p>
                <p className="text-xs text-stone-500 truncate">{profile?.email}</p>
              </div>
            </button>
            <Button variant="ghost" onClick={handleLogout} className="w-full justify-start text-red-600 hover:bg-red-50 hover:text-red-700">
              <LogOut className="w-5 h-5" /> Sair
            </Button>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 flex flex-col min-w-0">
          <header className="h-20 bg-white border-b border-stone-200 flex items-center justify-between px-8">
            <h1 className="text-xl font-bold text-stone-900 capitalize">
              {view === 'dashboard' && 'Visão Geral'}
              {view === 'academy' && 'Minha Academia'}
              {view === 'athletes' && 'Atletas'}
              {view === 'registrations' && 'Inscrições'}
              {view === 'admin' && 'Administração'}
              {view === 'profile' && 'Meu Perfil'}
            </h1>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-full text-xs font-bold border border-emerald-100">
                <CheckCircle2 className="w-4 h-4" /> Sistema Online
              </div>
            </div>
          </header>

          <div className="p-8 overflow-y-auto">
            <AnimatePresence mode="wait">
              {view === 'dashboard' && <DashboardView key="dashboard" profile={profile} stats={{ academies: academies.length, athletes: athletes.length, registrations: registrations.length }} settings={settings} />}
              {view === 'academy' && <AcademyView key="academy" profile={profile} academies={academies} />}
              {view === 'athletes' && <AthletesView key="athletes" profile={profile} athletes={athletes} academies={academies} />}
              {view === 'registrations' && <RegistrationsView key="registrations" profile={profile} registrations={registrations} athletes={athletes} academies={academies} receipts={receipts} settings={settings} />}
              {view === 'admin' && <AdminView key="admin" profile={profile} registrations={registrations} athletes={athletes} academies={academies} receipts={receipts} settings={settings} />}
              {view === 'profile' && <ProfileView key="profile" profile={profile} user={user} />}
            </AnimatePresence>
          </div>
        </main>
      </div>
    </ErrorBoundary>
  );
}

// --- Sub-Views ---

function NavItem({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all',
        active 
          ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/10' 
          : 'text-stone-500 hover:bg-stone-50 hover:text-stone-900'
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function DashboardView({ stats, profile, settings, key }: { stats: { academies: number; athletes: number; registrations: number }; profile: UserProfile | null; settings?: any; key?: string }) {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-8"
    >
      <TributeCard settings={settings} />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatCard icon={<School className="w-6 h-6" />} label="Academias" value={stats.academies} color="bg-blue-500" />
        <StatCard icon={<Users className="w-6 h-6" />} label="Atletas Cadastrados" value={stats.athletes} color="bg-emerald-500" />
        <StatCard icon={<Trophy className="w-6 h-6" />} label="Inscrições Ativas" value={stats.registrations} color="bg-amber-500" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <Card className="p-6">
          <h3 className="text-lg font-bold text-stone-900 mb-4">Próximos Passos</h3>
          <div className="space-y-4">
            <StepItem done={stats.academies > 0} label="Cadastrar sua Academia" description="Defina o nome e mestre responsável." />
            <StepItem done={stats.athletes > 0} label="Cadastrar Atletas" description="Adicione os alunos que irão participar." />
            <StepItem done={stats.registrations > 0} label="Realizar Inscrições" description="Escolha as categorias para cada atleta." />
          </div>
        </Card>

        <Card className="p-6 bg-stone-900 text-white border-none">
          <h3 className="text-lg font-bold mb-2">Informações do Festival</h3>
          <p className="text-stone-400 text-sm mb-6">3º Festival União Lopes Taekwondo e Filiados 2026</p>
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Calendar className="w-5 h-5 text-red-500" />
              <div>
                <p className="text-sm font-bold">12 de Abril (Domingo)</p>
                <p className="text-xs text-stone-400">Das 08:00 às 19:00</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Shield className="text-blue-500 w-5 h-5" />
              <div>
                <p className="text-sm font-bold">Colégio Estadual Cívico-Militar Alfredo Chaves</p>
                <p className="text-xs text-stone-400">R. Budapeste, 8 - Rio Verde, Colombo</p>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </motion.div>
  );
}

function StatCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number; color: string }) {
  return (
    <Card className="p-6 flex items-center gap-6">
      <div className={cn('w-14 h-14 rounded-2xl flex items-center justify-center text-white shadow-lg', color)}>
        {icon}
      </div>
      <div>
        <p className="text-sm font-medium text-stone-500">{label}</p>
        <p className="text-3xl font-bold text-stone-900">{value}</p>
      </div>
    </Card>
  );
}

function TributeCard({ settings }: { settings?: any }) {
  const tributeImage = settings?.tributeImage || "https://images.unsplash.com/photo-1555597673-b21d5c935865?auto=format&fit=crop&q=80";
  
  return (
    <Card className="p-6 bg-gradient-to-br from-stone-900 to-stone-800 text-white border-stone-700 relative overflow-hidden">
      <div className="absolute top-0 right-0 w-32 h-32 bg-red-600/20 rounded-full blur-3xl -mr-10 -mt-10" />
      <div className="relative z-10 flex flex-col sm:flex-row gap-6 items-center sm:items-start text-center sm:text-left">
        <div className="w-24 h-24 shrink-0 rounded-full overflow-hidden border-2 border-stone-600 shadow-xl">
          <img 
            src={tributeImage}
            alt="Taekwondo Tribute" 
            className="w-full h-full object-cover grayscale"
          />
        </div>
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-stone-800 border border-stone-700 text-xs font-bold text-stone-300 uppercase tracking-wider mb-1">
            <Trophy className="w-3 h-3 text-amber-500" />
            Homenagem Especial
          </div>
          <h3 className="text-xl font-bold text-white">Em Memória de Chuck Norris</h3>
          <p className="text-stone-400 text-sm font-medium">1940 – 2026</p>
          <p className="text-stone-300 text-sm leading-relaxed mt-2">
            Um dos maiores embaixadores do Taekwondo, que ajudou a popularizar nossa arte marcial globalmente. Seu legado viverá para sempre nos tatames e na história das artes marciais.
          </p>
        </div>
      </div>
    </Card>
  );
}

function StepItem({ done, label, description }: { done: boolean; label: string; description: string }) {
  return (
    <div className="flex gap-4">
      <div className={cn(
        'w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-1',
        done ? 'bg-emerald-100 text-emerald-600' : 'bg-stone-100 text-stone-400'
      )}>
        {done ? <CheckCircle2 className="w-4 h-4" /> : <div className="w-2 h-2 rounded-full bg-current" />}
      </div>
      <div>
        <p className={cn('text-sm font-bold', done ? 'text-stone-400 line-through' : 'text-stone-900')}>{label}</p>
        <p className="text-xs text-stone-500">{description}</p>
      </div>
    </div>
  );
}

function AcademyView({ profile, academies, key }: { profile: UserProfile | null; academies: Academy[]; key?: string }) {
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({ name: '', coach: '', master: '', contact: '', logo: '' });
  const [isCustomName, setIsCustomName] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    try {
      if (editingId) {
        await updateDoc(doc(db, 'academies', editingId), formData);
      } else {
        await addDoc(collection(db, 'academies'), {
          ...formData,
          createdBy: profile.uid
        });
      }
      setIsAdding(false);
      setEditingId(null);
      setFormData({ name: '', coach: '', master: '', contact: '', logo: '' });
      setIsCustomName(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'academies');
    }
  };

  const handleEdit = (academy: Academy) => {
    setFormData({
      name: academy.name,
      coach: academy.coach || '',
      master: academy.master,
      contact: academy.contact,
      logo: academy.logo || ''
    });
    setEditingId(academy.id);
    setIsAdding(true);
    setIsCustomName(!PREDEFINED_ACADEMIES.some(a => a.value === academy.name));
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 800000) {
      alert('A imagem é muito grande. Por favor, envie uma imagem menor (máx 800KB).');
      return;
    }

    setIsUploading(true);
    try {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result as string;
        setFormData(prev => ({ ...prev, logo: base64String }));
        setIsUploading(false);
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error("Erro ao processar foto:", error);
      alert('Erro ao processar foto.');
      setIsUploading(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Gestão de Academias</h2>
        {!isAdding && academies.length === 0 && (
          <Button onClick={() => setIsAdding(true)}><Plus className="w-5 h-5" /> Nova Academia</Button>
        )}
      </div>

      {isAdding ? (
        <Card className="p-8 max-w-2xl mx-auto">
          <form onSubmit={handleSubmit} className="space-y-6">
            <h3 className="text-xl font-bold mb-4">{editingId ? 'Editar Academia' : 'Cadastrar Academia'}</h3>
            
            <div className="flex flex-col items-center gap-4 mb-6">
              <div className="relative">
                {formData.logo ? (
                  <img src={formData.logo} alt="Logo da Academia" className="w-24 h-24 rounded-full border-4 border-white shadow-lg object-cover bg-stone-100" />
                ) : (
                  <div className="w-24 h-24 rounded-full border-4 border-white shadow-lg bg-stone-100 flex items-center justify-center">
                    <School className="w-8 h-8 text-stone-300" />
                  </div>
                )}
                <button 
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="absolute bottom-0 right-0 p-2 bg-blue-600 text-white rounded-full shadow-md hover:bg-blue-700 transition-colors"
                  disabled={isUploading}
                >
                  <Camera className="w-4 h-4" />
                </button>
                <input 
                  type="file" 
                  accept="image/*" 
                  className="hidden" 
                  ref={fileInputRef}
                  onChange={handlePhotoUpload}
                />
              </div>
              <p className="text-xs text-stone-500">Logo da Academia (Opcional)</p>
            </div>

            <Select 
              label="Academia" 
              options={PREDEFINED_ACADEMIES} 
              value={isCustomName ? 'Outra' : formData.name}
              onChange={e => {
                const val = e.target.value;
                if (val === 'Outra') {
                  setIsCustomName(true);
                  setFormData({ ...formData, name: '' });
                } else {
                  setIsCustomName(false);
                  setFormData({ ...formData, name: val });
                }
              }}
              required
            />

            {isCustomName && (
              <Input 
                label="Nome da Academia (Personalizado)" 
                placeholder="Ex: União Lopes Matriz" 
                value={formData.name}
                onChange={e => setFormData({ ...formData, name: e.target.value })}
                required
              />
            )}

            <Input 
              label="Técnico Responsável pela Equipe" 
              placeholder="Nome do Técnico" 
              value={formData.coach}
              onChange={e => setFormData({ ...formData, coach: e.target.value })}
              required
            />
            <Input 
              label="Contato WhatsApp (Gestão/Técnico)" 
              placeholder="(00) 00000-0000" 
              value={formData.contact}
              onChange={e => setFormData({ ...formData, contact: e.target.value })}
              required
            />
            <Input 
              label="Mestre Responsável" 
              placeholder="Nome do Mestre" 
              value={formData.master}
              onChange={e => setFormData({ ...formData, master: e.target.value })}
              required
            />
            <div className="flex gap-4 pt-4">
              <Button type="submit" className="flex-1">{editingId ? 'Salvar Alterações' : 'Salvar Academia'}</Button>
              <Button type="button" variant="secondary" onClick={() => {
                setIsAdding(false);
                setEditingId(null);
                setFormData({ name: '', coach: '', master: '', contact: '', logo: '' });
                setIsCustomName(false);
              }}>Cancelar</Button>
            </div>
            
            <div className="pt-4 border-t border-stone-100 flex justify-center">
              <Button 
                type="button" 
                variant="ghost" 
                className="text-xs text-stone-500 hover:text-stone-900"
                onClick={() => setFormData(prev => ({ ...prev, logo: UNIAO_LOPES_LOGO }))}
              >
                Usar Logo Padrão (Associação Colombo)
              </Button>
            </div>
          </form>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {academies.map(academy => (
            <Card key={academy.id} className="p-6 space-y-4">
              <div className="flex justify-between items-start">
                {academy.logo ? (
                  <img src={academy.logo} alt={academy.name} className="w-12 h-12 rounded-xl object-cover bg-stone-100" />
                ) : (
                  <div className="w-12 h-12 bg-stone-100 rounded-xl flex items-center justify-center">
                    <School className="w-6 h-6 text-stone-600" />
                  </div>
                )}
                <div className="flex gap-2">
                  <Button variant="ghost" className="p-2 h-auto" onClick={() => handleEdit(academy)}><Edit className="w-4 h-4" /></Button>
                </div>
              </div>
              <div>
                <h4 className="text-lg font-bold text-stone-900">{academy.name}</h4>
                <p className="text-sm text-stone-500">Técnico: {academy.coach}</p>
                <p className="text-sm text-stone-500">Mestre: {academy.master}</p>
                <p className="text-sm text-stone-500">Contato: {academy.contact}</p>
              </div>
            </Card>
          ))}
          {academies.length === 0 && (
            <div className="col-span-full py-20 text-center space-y-4">
              <div className="w-20 h-20 bg-stone-100 rounded-full mx-auto flex items-center justify-center">
                <School className="w-10 h-10 text-stone-300" />
              </div>
              <p className="text-stone-500">Nenhuma academia cadastrada ainda.</p>
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
}

const PREDEFINED_ACADEMIES = [
  { value: 'Real Samuray', label: 'Real Samuray' },
  { value: 'CCM Alfredo Chaves', label: 'CCM Alfredo Chaves' },
  { value: 'Djalma Johnsson', label: 'Djalma Johnsson' },
  { value: 'Azevedo', label: 'Azevedo' },
  { value: 'JC (José Calixto)', label: 'JC (José Calixto)' },
  { value: 'CT Brasa', label: 'CT Brasa' },
  { value: 'Base TKD', label: 'Base TKD' },
  { value: 'Dojo Hamdar', label: 'Dojo Hamdar' },
  { value: 'Leia Helena TKD', label: 'Leia Helena TKD' },
  { value: 'King of Fight', label: 'King of Fight' },
  { value: 'Liga Pegasus', label: 'Liga Pegasus' },
  { value: 'Liga Shekinah', label: 'Liga Shekinah' },
  { value: 'Tae Kombat', label: 'Tae Kombat' },
  { value: 'Guerra TKD', label: 'Guerra TKD' },
  { value: 'Sadrak Lutas (pro. Sadrak)', label: 'Sadrak Lutas (pro. Sadrak)' },
  { value: 'Escola de Taekwondo (prof Roy)', label: 'Escola de Taekwondo (prof Roy)' },
  { value: 'TKD Kajuru', label: 'TKD Kajuru' },
  { value: 'Dinamite', label: 'Dinamite' },
  { value: 'Outra', label: 'Outra (Digitar manualmente)' }
];

const BELT_OPTIONS = [
  { value: '10º Gub - Branca', label: '10º Gub - Branca' },
  { value: '9º Gub - Cinza', label: '9º Gub - Cinza' },
  { value: '8º Gub - Amarela', label: '8º Gub - Amarela' },
  { value: '7º Gub - Laranja', label: '7º Gub - Laranja' },
  { value: '6º Gub - Verde Claro', label: '6º Gub - Verde Claro' },
  { value: '5º Gub - Verde Escuro', label: '5º Gub - Verde Escuro' },
  { value: '4º Gub - Azul Claro', label: '4º Gub - Azul Claro' },
  { value: '3º Gub - Azul Escuro', label: '3º Gub - Azul Escuro' },
  { value: '2º Gub - Vermelha', label: '2º Gub - Vermelha' },
  { value: '1º Gub - Vermelha Escura', label: '1º Gub - Vermelha Escura' },
  { value: '1º Dan - Preta', label: '1º Dan - Preta' },
  { value: '2º Dan - Preta', label: '2º Dan - Preta' },
  { value: '3º Dan - Preta', label: '3º Dan - Preta' },
  { value: '4º Dan - Preta', label: '4º Dan - Preta' },
  { value: '5º Dan - Preta', label: '5º Dan - Preta' },
  { value: '6º Dan - Preta', label: '6º Dan - Preta' },
  { value: '7º Dan - Preta', label: '7º Dan - Preta' },
  { value: '8º Dan - Preta', label: '8º Dan - Preta' },
  { value: '9º Dan - Preta', label: '9º Dan - Preta' },
  { value: '10º Dan - Preta', label: '10º Dan - Preta' },
];

function BeltBadge({ belt }: { belt: string }) {
  let style: React.CSSProperties = {};
  let className = "px-2 py-1 rounded text-xs font-bold inline-flex items-center gap-1.5 ";
  
  // Faixas antigas (transição)
  if (belt.includes('Branca/Amarela')) {
    style = { background: 'linear-gradient(90deg, #ffffff 50%, #facc15 50%)', color: '#1c1917', border: '1px solid #e7e5e4' };
  } else if (belt.includes('Amarela/Verde')) {
    style = { background: 'linear-gradient(90deg, #facc15 50%, #22c55e 50%)', color: '#1c1917' };
  } else if (belt.includes('Verde/Azul')) {
    style = { background: 'linear-gradient(90deg, #22c55e 50%, #3b82f6 50%)', color: '#ffffff' };
  } else if (belt.includes('Azul/Vermelha')) {
    style = { background: 'linear-gradient(90deg, #3b82f6 50%, #ef4444 50%)', color: '#ffffff' };
  } else if (belt.includes('Vermelha/Preta')) {
    style = { background: 'linear-gradient(90deg, #ef4444 50%, #000000 50%)', color: '#ffffff' };
  } 
  // Novas faixas
  else if (belt.includes('Branca')) {
    className += 'bg-white text-stone-800 border border-stone-200 shadow-sm';
  } else if (belt.includes('Cinza')) {
    className += 'bg-gray-300 text-stone-800';
  } else if (belt.includes('Amarela')) {
    className += 'bg-yellow-400 text-stone-900';
  } else if (belt.includes('Laranja')) {
    className += 'bg-orange-500 text-white';
  } else if (belt.includes('Verde Claro')) {
    className += 'bg-green-400 text-stone-900';
  } else if (belt.includes('Verde Escuro')) {
    className += 'bg-green-800 text-white';
  } else if (belt.includes('Verde')) {
    className += 'bg-green-500 text-white'; // fallback antiga
  } else if (belt.includes('Azul Claro')) {
    className += 'bg-sky-400 text-stone-900';
  } else if (belt.includes('Azul Escuro')) {
    className += 'bg-blue-900 text-white';
  } else if (belt.includes('Azul')) {
    className += 'bg-blue-500 text-white'; // fallback antiga
  } else if (belt.includes('Vermelha Escura') || belt.includes('Bordô')) {
    className += 'bg-red-900 text-white';
  } else if (belt.includes('Vermelha')) {
    className += 'bg-red-500 text-white';
  } else if (belt.includes('Preta')) {
    className += 'bg-black text-white';
  } else {
    className += 'bg-stone-100 text-stone-700';
  }

  return (
    <span className={className} style={style}>
      {belt}
    </span>
  );
}

function AthletesView({ profile, athletes, academies, key }: { profile: UserProfile | null; athletes: Athlete[]; academies: Academy[]; key?: string }) {
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    birthDate: '',
    gender: 'M' as 'M' | 'F',
    belt: '',
    weight: 0,
    academyId: '',
    avatar: ''
  });

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 800000) {
      alert('A imagem é muito grande. Por favor, envie uma imagem menor (máx 800KB).');
      return;
    }

    setIsUploading(true);
    try {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result as string;
        setFormData(prev => ({ ...prev, avatar: base64String }));
        setIsUploading(false);
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error("Erro ao processar foto:", error);
      alert('Erro ao processar foto.');
      setIsUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    try {
      if (editingId) {
        await updateDoc(doc(db, 'athletes', editingId), formData);
      } else {
        await addDoc(collection(db, 'athletes'), {
          ...formData,
          createdBy: profile.uid
        });
      }
      setIsAdding(false);
      setEditingId(null);
      setFormData({ name: '', birthDate: '', gender: 'M', belt: '', weight: 0, academyId: '', avatar: '' });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'athletes');
    }
  };

  const handleEdit = (athlete: Athlete) => {
    setFormData({
      name: athlete.name,
      birthDate: athlete.birthDate,
      gender: athlete.gender,
      belt: athlete.belt,
      weight: athlete.weight,
      academyId: athlete.academyId,
      avatar: athlete.avatar || ''
    });
    setEditingId(athlete.id);
    setIsAdding(true);
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('Tem certeza que deseja excluir este atleta?')) {
      try {
        await deleteDoc(doc(db, 'athletes', id));
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, 'athletes');
      }
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Gestão de Atletas</h2>
        {!isAdding && (
          <Button onClick={() => setIsAdding(true)}><Plus className="w-5 h-5" /> Novo Atleta</Button>
        )}
      </div>

      {isAdding ? (
        <Card className="p-8 max-w-2xl mx-auto">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold">{editingId ? 'Editar Atleta' : 'Cadastrar Atleta'}</h3>
              {!editingId && profile?.displayName && (
                <Button 
                  type="button" 
                  variant="secondary" 
                  className="text-xs py-1 px-3 h-auto"
                  onClick={() => setFormData(prev => ({ ...prev, name: profile.displayName || '', avatar: profile.photoURL || '' }))}
                >
                  Sou eu mesmo (Usar meu nome)
                </Button>
              )}
            </div>

            <div className="flex flex-col items-center gap-4 mb-6">
              <div className="relative">
                {formData.avatar ? (
                  <img src={formData.avatar} alt="Avatar" className="w-24 h-24 rounded-full object-cover border-4 border-white shadow-lg" />
                ) : (
                  <div className="w-24 h-24 rounded-full bg-stone-100 border-4 border-white shadow-lg flex items-center justify-center">
                    <UserPlus className="w-8 h-8 text-stone-400" />
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                  className="absolute bottom-0 right-0 p-2 bg-stone-900 text-white rounded-full hover:bg-stone-800 transition-colors shadow-md disabled:opacity-50"
                  title="Alterar foto"
                >
                  <Camera className="w-4 h-4" />
                </button>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handlePhotoUpload}
                  accept="image/*"
                  className="hidden"
                />
              </div>
              <p className="text-xs text-stone-500">Foto do Atleta (Opcional)</p>
            </div>

            <Input label="Nome Completo" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} required />
            <div className="grid grid-cols-2 gap-4">
              <Input label="Data de Nascimento" type="date" value={formData.birthDate} onChange={e => setFormData({ ...formData, birthDate: e.target.value })} required />
              <Select 
                label="Gênero" 
                options={[{ value: 'M', label: 'Masculino' }, { value: 'F', label: 'Feminino' }]} 
                value={formData.gender}
                onChange={e => setFormData({ ...formData, gender: e.target.value as 'M' | 'F' })}
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Select 
                label="Faixa" 
                options={BELT_OPTIONS} 
                value={formData.belt}
                onChange={e => setFormData({ ...formData, belt: e.target.value })}
                required
              />
              <Input label="Peso (kg)" type="number" step="0.1" value={formData.weight} onChange={e => setFormData({ ...formData, weight: Number(e.target.value) })} required />
            </div>
            <Select 
              label="Academia" 
              options={academies.map(a => ({ value: a.id, label: a.name }))} 
              value={formData.academyId}
              onChange={e => setFormData({ ...formData, academyId: e.target.value })}
              required
            />
            <div className="flex gap-4 pt-4">
              <Button type="submit" className="flex-1">{editingId ? 'Salvar Alterações' : 'Salvar Atleta'}</Button>
              <Button type="button" variant="secondary" onClick={() => {
                setIsAdding(false);
                setEditingId(null);
                setFormData({ name: '', birthDate: '', gender: 'M', belt: '', weight: 0, academyId: '', avatar: '' });
              }}>Cancelar</Button>
            </div>
          </form>
        </Card>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-stone-50 border-b border-stone-200">
                <th className="px-6 py-4 text-xs font-bold text-stone-500 uppercase tracking-wider">Atleta</th>
                <th className="px-6 py-4 text-xs font-bold text-stone-500 uppercase tracking-wider">Categoria Oficial</th>
                <th className="px-6 py-4 text-xs font-bold text-stone-500 uppercase tracking-wider">Graduação</th>
                <th className="px-6 py-4 text-xs font-bold text-stone-500 uppercase tracking-wider">Peso</th>
                <th className="px-6 py-4 text-xs font-bold text-stone-500 uppercase tracking-wider">Academia</th>
                <th className="px-6 py-4 text-xs font-bold text-stone-500 uppercase tracking-wider">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {athletes.map(athlete => {
                const ageCat = getAgeCategory(athlete.birthDate, athlete.belt);
                const weightCat = getWeightCategory(ageCat, athlete.gender, athlete.weight, athlete.belt);
                return (
                <tr key={athlete.id} className="hover:bg-stone-50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      {athlete.avatar ? (
                        <img src={athlete.avatar} alt={athlete.name} className="w-10 h-10 rounded-full object-cover border border-stone-200" />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-stone-100 flex items-center justify-center text-stone-400 font-bold text-sm border border-stone-200">
                          {athlete.name.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-bold text-stone-900">{athlete.name}</p>
                          {athlete.createdBy === profile?.uid && athlete.name === profile?.displayName && (
                            <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-[10px] font-bold rounded uppercase tracking-wider">Você</span>
                          )}
                        </div>
                        <p className="text-xs text-stone-500">{new Date(athlete.birthDate).toLocaleDateString('pt-BR')}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <p className="font-bold text-stone-900 text-sm">{ageCat} - {athlete.gender === 'M' ? 'Masculino' : 'Feminino'}</p>
                    <p className="text-xs text-stone-500">{weightCat}</p>
                  </td>
                  <td className="px-6 py-4">
                    <BeltBadge belt={athlete.belt} />
                  </td>
                  <td className="px-6 py-4 text-sm text-stone-600">{athlete.weight} kg</td>
                  <td className="px-6 py-4 text-sm text-stone-600">
                    {academies.find(a => a.id === athlete.academyId)?.name || 'N/A'}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex gap-2">
                      <Button variant="ghost" className="p-2 h-auto" onClick={() => handleEdit(athlete)}><Edit className="w-4 h-4" /></Button>
                      <Button variant="ghost" className="p-2 h-auto text-red-500 hover:bg-red-50" onClick={() => handleDelete(athlete.id)}><Trash2 className="w-4 h-4" /></Button>
                    </div>
                  </td>
                </tr>
              )})}
              {athletes.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-20 text-center text-stone-500">Nenhum atleta cadastrado.</td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
      )}
    </motion.div>
  );
}

function RegistrationsView({ profile, registrations, athletes, academies, receipts, settings, key }: { profile: UserProfile | null; registrations: Registration[]; athletes: Athlete[]; academies: Academy[]; receipts: any[]; settings: any; key?: string }) {
  const [isAdding, setIsAdding] = useState(false);
  const [formData, setFormData] = useState({
    athleteId: '',
    categories: [] as ('Kyorugui' | 'Poomsae' | 'Kyopa (3 tábuas)' | 'Kyopa (5 tábuas)')[],
  });

  const toggleCategory = (cat: 'Kyorugui' | 'Poomsae' | 'Kyopa (3 tábuas)' | 'Kyopa (5 tábuas)') => {
    setFormData(prev => ({
      ...prev,
      categories: prev.categories.includes(cat) 
        ? prev.categories.filter(c => c !== cat)
        : [...prev.categories, cat]
    }));
  };

  const calculatePrice = (categories: string[]) => {
    let total = 0;
    if (categories.includes('Kyorugui') || categories.includes('Poomsae')) {
      total += 90;
    }
    if (categories.includes('Kyopa (3 tábuas)')) total += 25;
    if (categories.includes('Kyopa (5 tábuas)')) total += 35;
    return total;
  };

  const currentPrice = calculatePrice(formData.categories);
  const [isGeneratingPix, setIsGeneratingPix] = useState(false);
  const [isUploadingReceipt, setIsUploadingReceipt] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pixCode = "00020126360014BR.GOV.BCB.PIX0114+55419971149975204000053039865802BR5913Leonardo Reis6009SAO PAULO62140510vHge3cTxOP630450EF";

  const [uploadingAcademyId, setUploadingAcademyId] = useState<string | null>(null);

  const handleReceiptUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !uploadingAcademyId) return;

    if (file.size > 800000) {
      alert('O arquivo é muito grande. Por favor, envie uma imagem menor (máx 800KB).');
      return;
    }

    setIsUploadingReceipt(true);
    try {
      // Convert to base64
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64String = reader.result as string;
        
        // Create receipt document
        await addDoc(collection(db, 'receipts'), {
          academyId: uploadingAcademyId,
          receiptData: base64String,
          createdAt: new Date().toISOString()
        });

        // Update all pending registrations for this academy to 'Em Análise'
        const pendingRegs = registrations.filter(r => r.academyId === uploadingAcademyId && r.paymentStatus === 'Pendente');
        await Promise.all(pendingRegs.map(reg => 
          updateDoc(doc(db, 'registrations', reg.id), {
            paymentStatus: 'Em Análise'
          })
        ));

        alert('Comprovante enviado com sucesso! Aguarde a liberação.');
        setIsUploadingReceipt(false);
        setUploadingAcademyId(null);
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error("Erro ao enviar comprovante:", error);
      alert('Erro ao enviar comprovante. Tente novamente.');
      setIsUploadingReceipt(false);
      setUploadingAcademyId(null);
    }
  };

  const redirectToCheckout = async (amount: number, description: string) => {
    try {
      setIsGeneratingPix(true);
      const response = await fetch('/api/payments/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transaction_amount: amount,
          description: description,
          payer_email: profile?.email || 'contato@laravitoria.com',
          external_reference: profile?.academyId || profile?.uid
        })
      });
      
      if (!response.ok) throw new Error('Falha ao gerar checkout');
      
      const data = await response.json();
      
      // Redireciona para o Checkout Pro do Mercado Pago
      if (data.init_point) {
        window.location.href = data.init_point;
      } else {
        throw new Error('URL de checkout não encontrada');
      }
    } catch (error) {
      console.error(error);
      alert('Erro ao iniciar pagamento com Mercado Pago. Você ainda pode usar o PIX manual.');
    } finally {
      setIsGeneratingPix(false);
    }
  };

  const handlePaymentStatus = async (regId: string, currentStatus: string) => {
    try {
      const newStatus = currentStatus === 'Pago' ? 'Pendente' : 'Pago';
      await updateDoc(doc(db, 'registrations', regId), {
        paymentStatus: newStatus,
        status: newStatus === 'Pago' ? 'Confirmado' : 'Pendente'
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'registrations');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    if (formData.categories.length === 0) {
      alert("Selecione pelo menos uma categoria.");
      return;
    }
    
    const athlete = athletes.find(a => a.id === formData.athleteId);
    if (!athlete) return;

    try {
      await addDoc(collection(db, 'registrations'), {
        ...formData,
        academyId: athlete.academyId,
        status: 'Pendente',
        paymentStatus: 'Pendente',
        createdAt: new Date().toISOString()
      });

      try {
        const text = `Olá! A inscrição do atleta *${athlete.name}* no 3º Festival União Lopes foi registrada com sucesso. 🥋\n\n*Categorias:* ${formData.categories.join(', ')}\n*Status:* Pendente\n\nLembre-se de enviar o comprovante de pagamento para confirmar a participação.`;
        if (window.confirm('Inscrição realizada com sucesso! Deseja compartilhar o comprovante via WhatsApp?')) {
          window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
        }
      } catch (e) {
        console.error('Erro ao gerar link do WhatsApp:', e);
      }

      setIsAdding(false);
      setFormData({ athleteId: '', categories: [] });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'registrations');
    }
  };

  const myAcademyRegs = profile?.role === 'admin'
    ? registrations
    : registrations.filter(r => academies.some(a => a.id === r.academyId));
  
  const academiesWithPendingOrAnalysis = academies.filter(a => 
    registrations.some(r => r.academyId === a.id && (r.paymentStatus === 'Pendente' || r.paymentStatus === 'Em Análise'))
  );

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Inscrições no Festival</h2>
        {!isAdding && athletes.length > 0 && (
          <Button onClick={() => setIsAdding(true)}><Plus className="w-5 h-5" /> Nova Inscrição</Button>
        )}
      </div>

      {!isAdding && academiesWithPendingOrAnalysis.map(academy => {
        const pendingRegs = registrations.filter(r => r.academyId === academy.id && r.paymentStatus === 'Pendente');
        const analysisRegs = registrations.filter(r => r.academyId === academy.id && r.paymentStatus === 'Em Análise');
        const totalPending = pendingRegs.reduce((sum, r) => sum + calculatePrice(r.categories), 0);
        const academyReceipts = receipts.filter(r => r.academyId === academy.id);

        return (
          <Card key={academy.id} className="p-6 bg-amber-50 border-amber-200 flex flex-col md:flex-row gap-8 items-start justify-between">
            <div className="flex-1 w-full">
              <h3 className="text-lg font-bold text-amber-900 mb-1">
                {pendingRegs.length > 0 ? `Pagamento Pendente - ${academy.name}` : `Pagamento em Análise - ${academy.name}`}
              </h3>
              <p className="text-amber-700 text-sm mb-4">
                {pendingRegs.length > 0 
                  ? 'Sua academia possui inscrições aguardando pagamento. Você pode fazer um PIX único com o valor total.'
                  : 'Seu comprovante foi enviado e está em análise pelo administrador.'}
              </p>

              <div className="mb-6 bg-white/50 p-4 rounded-xl border border-amber-200/50 max-h-40 overflow-y-auto">
                <p className="text-xs font-bold text-amber-900 uppercase tracking-wider mb-3">Resumo das Inscrições</p>
                <div className="space-y-2">
                  {[...pendingRegs, ...analysisRegs].map(reg => {
                    const athlete = athletes.find(a => a.id === reg.athleteId);
                    return (
                      <div key={reg.id} className="flex justify-between items-center text-sm border-b border-amber-100/50 pb-2 last:border-0 last:pb-0">
                        <span className="font-medium text-stone-700">{athlete?.name || 'Atleta desconhecido'}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-stone-500">{reg.categories.join(', ')} - R$ {calculatePrice(reg.categories).toFixed(2).replace('.', ',')}</span>
                          {reg.paymentStatus === 'Em Análise' && (
                            <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-[10px] font-bold rounded uppercase tracking-wider">Em Análise</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {pendingRegs.length > 0 && (
                <>
                  <p className="text-3xl font-bold text-amber-900 mb-4">R$ {totalPending.toFixed(2).replace('.', ',')}</p>
                  {settings.mercadoPagoEnabled && (
                    <Button 
                      onClick={() => {
                        const desc = pendingRegs.map(reg => {
                          const athlete = athletes.find(a => a.id === reg.athleteId);
                          return `${athlete?.name} (${reg.categories.join(', ')})`;
                        }).join(' | ').substring(0, 250);
                        redirectToCheckout(totalPending, desc || `Inscrições Academia ${academy.name}`);
                      }}
                      disabled={isGeneratingPix}
                      className="bg-blue-600 hover:bg-blue-700 text-white"
                    >
                      {isGeneratingPix ? 'Iniciando pagamento...' : 'Pagar com Mercado Pago'}
                    </Button>
                  )}
                </>
              )}
            </div>

            {pendingRegs.length > 0 ? (
              <div className="flex flex-col sm:flex-row gap-6 items-center bg-white p-6 rounded-2xl border border-amber-200 shadow-sm shrink-0 max-w-md">
                <div className="shrink-0 bg-white p-2 rounded-xl shadow-sm border border-stone-100">
                  <QRCodeSVG value={pixCode} size={110} />
                </div>
                <div className="space-y-4 flex-1 w-full">
                  <div>
                    <p className="text-sm font-bold text-stone-800 mb-2">Ou pague via PIX Manual</p>
                    <div className="flex gap-2">
                      <input 
                        type="text" 
                        readOnly 
                        value={pixCode.substring(0, 25) + '...'} 
                        className="w-full text-xs px-3 py-2 bg-stone-50 border border-stone-200 rounded-lg text-stone-500 outline-none"
                      />
                      <Button 
                        type="button" 
                        variant="secondary" 
                        className="text-xs py-2 px-4 h-auto bg-white border-stone-200 hover:bg-stone-50 text-stone-700 rounded-lg shadow-sm shrink-0"
                        onClick={() => {
                          navigator.clipboard.writeText(pixCode);
                          alert('Código PIX copiado!');
                        }}
                      >
                        Copiar
                      </Button>
                    </div>
                  </div>
                  
                  <div>
                    <input 
                      type="file" 
                      accept="image/*,.pdf" 
                      className="hidden" 
                      ref={fileInputRef}
                      onChange={handleReceiptUpload}
                    />
                    <Button 
                      type="button" 
                      variant="secondary" 
                      className="w-full text-sm py-2 h-auto border-amber-400 text-amber-600 hover:bg-amber-50 bg-white rounded-lg font-semibold"
                      onClick={() => {
                        setUploadingAcademyId(academy.id);
                        fileInputRef.current?.click();
                      }}
                      disabled={isUploadingReceipt}
                    >
                      {isUploadingReceipt ? 'Enviando...' : 'Enviar Comprovante'}
                    </Button>
                  </div>
                  <p className="text-[11px] text-stone-500 leading-tight">
                    Após o pagamento manual, envie o comprovante para o administrador para liberação.{settings.mercadoPagoEnabled && ' Pelo Mercado Pago a liberação é automática.'}
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-4 items-center justify-center bg-white p-6 rounded-2xl border border-amber-200 shadow-sm shrink-0 w-full md:w-64">
                <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mb-2">
                  <CheckCircle2 className="w-8 h-8 text-blue-500" />
                </div>
                <p className="text-sm font-bold text-stone-800 text-center">Comprovante em Análise</p>
                {academyReceipts.length > 0 && (
                  <a 
                    href={academyReceipts[0].receiptData} 
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs py-2 px-4 w-full text-center bg-stone-50 text-stone-700 border border-stone-200 rounded-lg font-medium hover:bg-stone-100 transition-colors"
                  >
                    Ver Comprovante Enviado
                  </a>
                )}
              </div>
            )}
          </Card>
        );
      })}

      {isAdding ? (
        <Card className="p-8 max-w-2xl mx-auto">
          <form onSubmit={handleSubmit} className="space-y-6">
            <h3 className="text-xl font-bold mb-4">Inscrever Atleta</h3>
            <Select 
              label="Atleta" 
              options={athletes.map(a => ({ value: a.id, label: a.name }))} 
              value={formData.athleteId}
              onChange={e => setFormData({ ...formData, athleteId: e.target.value })}
              required
            />
            
            <div className="space-y-2">
              <label className="text-sm font-medium text-stone-700">Categorias</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {(['Kyorugui', 'Poomsae', 'Kyopa (3 tábuas)', 'Kyopa (5 tábuas)'] as const).map(cat => (
                  <label key={cat} className={cn(
                    "flex items-center gap-3 p-4 border rounded-xl cursor-pointer transition-all",
                    formData.categories.includes(cat) ? "border-red-600 bg-red-50 text-red-900" : "border-stone-200 hover:bg-stone-50"
                  )}>
                    <input 
                      type="checkbox" 
                      className="w-4 h-4 text-red-600 rounded border-stone-300 focus:ring-red-600"
                      checked={formData.categories.includes(cat)}
                      onChange={() => toggleCategory(cat)}
                    />
                    <span className="font-medium text-sm">{cat}</span>
                  </label>
                ))}
              </div>
            </div>

            {currentPrice > 0 && (
              <div className="bg-stone-50 p-6 rounded-xl border border-stone-200 space-y-4">
                <div className="flex justify-between items-center border-b border-stone-200 pb-4">
                  <span className="font-medium text-stone-700">Total a pagar:</span>
                  <span className="text-2xl font-bold text-stone-900">R$ {currentPrice.toFixed(2).replace('.', ',')}</span>
                </div>
                
                <div className="flex flex-col md:flex-row gap-6 items-center">
                  <div className="bg-white p-2 rounded-xl shadow-sm border border-stone-100">
                    <QRCodeSVG value={pixCode} size={120} />
                  </div>
                  <div className="space-y-2 flex-1 w-full">
                    <p className="text-sm font-medium text-stone-700">Pague via PIX Copia e Cola</p>
                    <div className="flex gap-2">
                      <input 
                        type="text" 
                        readOnly 
                        value={pixCode} 
                        className="w-full text-xs px-3 py-2 bg-white border border-stone-200 rounded-lg text-stone-500 outline-none"
                      />
                      <Button 
                        type="button" 
                        variant="secondary" 
                        className="text-xs py-2 px-3"
                        onClick={() => {
                          navigator.clipboard.writeText(pixCode);
                          alert('Código PIX copiado!');
                        }}
                      >
                        Copiar
                      </Button>
                    </div>
                    <p className="text-xs text-stone-500 mt-2">Após o pagamento, a inscrição será confirmada pelo administrador.</p>
                  </div>
                </div>
              </div>
            )}

            <div className="flex gap-4 pt-4">
              <Button type="submit" className="flex-1">Confirmar Inscrição</Button>
              <Button type="button" variant="secondary" onClick={() => setIsAdding(false)}>Cancelar</Button>
            </div>
          </form>
        </Card>
      ) : (
        <div className="space-y-4">
          {registrations.map(reg => {
            const athlete = athletes.find(a => a.id === reg.athleteId);
            const ageCat = athlete ? getAgeCategory(athlete.birthDate, athlete.belt) : '';
            const weightCat = athlete ? getWeightCategory(ageCat, athlete.gender, athlete.weight, athlete.belt) : '';
            return (
              <Card key={reg.id} className="p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="relative">
                    {athlete?.avatar ? (
                      <img src={athlete.avatar} alt={athlete?.name} className="w-12 h-12 rounded-full object-cover border-2 border-white shadow-sm" />
                    ) : (
                      <div className={cn(
                        'w-12 h-12 rounded-full flex items-center justify-center border-2 border-white shadow-sm',
                        reg.status === 'Confirmado' ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-600'
                      )}>
                        {reg.status === 'Confirmado' ? <CheckCircle2 className="w-6 h-6" /> : <Clock className="w-6 h-6" />}
                      </div>
                    )}
                    {athlete?.avatar && (
                      <div className={cn(
                        'absolute -bottom-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center border-2 border-white',
                        reg.status === 'Confirmado' ? 'bg-emerald-500 text-white' : 'bg-amber-500 text-white'
                      )}>
                        {reg.status === 'Confirmado' ? <CheckCircle2 className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                      </div>
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-bold text-stone-900">{athlete?.name || 'Atleta não encontrado'}</p>
                      {athlete?.createdBy === profile?.uid && athlete?.name === profile?.displayName && (
                        <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-[10px] font-bold rounded uppercase tracking-wider">Você</span>
                      )}
                    </div>
                    <p className="text-xs text-stone-500">
                      {ageCat} - {athlete?.gender === 'M' ? 'Masculino' : 'Feminino'} ({weightCat}) • {reg.categories?.join(', ')} • {academies.find(a => a.id === reg.academyId)?.name} • <span className="font-bold text-stone-700">R$ {calculatePrice(reg.categories || []).toFixed(2).replace('.', ',')}</span>
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 w-full sm:w-auto flex-wrap sm:flex-nowrap">
                  <Button 
                    variant="secondary" 
                    className="text-xs py-1 px-3 h-auto bg-green-50 text-green-700 hover:bg-green-100 border-green-200"
                    onClick={() => {
                      const text = `Olá! A inscrição do atleta *${athlete?.name}* no 3º Festival União Lopes está *${reg.status}*. 🥋\n\n*Categorias:* ${reg.categories.join(', ')}\n*Status do Pagamento:* ${reg.paymentStatus}`;
                      
                      const academy = academies.find(a => a.id === reg.academyId);
                      let url = `https://wa.me/?text=${encodeURIComponent(text)}`;
                      
                      if (profile?.role === 'admin' && academy && academy.contact) {
                        const formattedPhone = formatWhatsAppNumber(academy.contact);
                        url = `https://wa.me/${formattedPhone}?text=${encodeURIComponent(text)}`;
                      } else if (profile?.role !== 'admin') {
                        // Se for a academia, envia mensagem para o organizador (Admin)
                        url = `https://wa.me/5541997114997?text=${encodeURIComponent(text)}`;
                      }
                      
                      window.open(url, '_blank');
                    }}
                  >
                    WhatsApp
                  </Button>
                  {profile?.role === 'admin' && (
                    <Button 
                      variant="secondary" 
                      className="text-xs py-1 px-3 h-auto"
                      onClick={() => handlePaymentStatus(reg.id, reg.paymentStatus)}
                    >
                      {reg.paymentStatus === 'Pago' ? 'Desfazer Pagamento' : 'Aprovar Pagamento'}
                    </Button>
                  )}
                  <div className="text-right ml-auto sm:ml-0">
                    <p className={cn(
                      'text-xs font-bold uppercase tracking-wider', 
                      reg.paymentStatus === 'Pago' ? 'text-emerald-600' : 
                      reg.paymentStatus === 'Em Análise' ? 'text-blue-600' : 'text-amber-600'
                    )}>
                      {reg.paymentStatus}
                    </p>
                    <p className="text-[10px] text-stone-400">Pagamento</p>
                  </div>
                  <div className="text-right">
                    <p className={cn('text-xs font-bold uppercase tracking-wider', reg.status === 'Confirmado' ? 'text-emerald-600' : 'text-amber-600')}>
                      {reg.status}
                    </p>
                    <p className="text-[10px] text-stone-400">Status</p>
                  </div>
                </div>
              </Card>
            );
          })}
          {registrations.length === 0 && (
            <div className="py-20 text-center text-stone-500">Nenhuma inscrição realizada.</div>
          )}
        </div>
      )}
    </motion.div>
  );
}

function ProfileView({ profile, user, key }: { profile: UserProfile | null; user: User; key?: string }) {
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !profile) return;

    if (file.size > 800000) {
      alert('A imagem é muito grande. Por favor, envie uma imagem menor (máx 800KB).');
      return;
    }

    setIsUploading(true);
    try {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64String = reader.result as string;
        await updateDoc(doc(db, 'users', profile.uid), {
          photoURL: base64String
        });
        alert('Foto atualizada com sucesso!');
        setIsUploading(false);
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error("Erro ao atualizar foto:", error);
      alert('Erro ao atualizar foto.');
      setIsUploading(false);
    }
  };

  const handleUseGooglePhoto = async () => {
    if (!profile || !user.photoURL) return;
    try {
      await updateDoc(doc(db, 'users', profile.uid), {
        photoURL: user.photoURL
      });
      alert('Foto do Google vinculada com sucesso!');
    } catch (error) {
      console.error("Erro ao atualizar foto:", error);
      alert('Erro ao atualizar foto.');
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6 max-w-2xl mx-auto">
      <h2 className="text-2xl font-bold">Meu Perfil</h2>
      <Card className="p-8">
        <div className="flex flex-col items-center gap-6">
          <div className="relative">
            <img 
              src={profile?.photoURL || user.photoURL || ''} 
              alt="Avatar" 
              className="w-32 h-32 rounded-full border-4 border-white shadow-lg object-cover bg-stone-100"
            />
            <button 
              onClick={() => fileInputRef.current?.click()}
              className="absolute bottom-0 right-0 p-3 bg-blue-600 text-white rounded-full shadow-md hover:bg-blue-700 transition-colors"
              disabled={isUploading}
            >
              <Camera className="w-5 h-5" />
            </button>
            <input 
              type="file" 
              accept="image/*" 
              className="hidden" 
              ref={fileInputRef}
              onChange={handlePhotoUpload}
            />
          </div>
          
          <div className="text-center space-y-1">
            <h3 className="text-xl font-bold text-stone-900">{profile?.displayName || user.displayName}</h3>
            <p className="text-stone-500">{profile?.email}</p>
            <p className="text-xs font-bold uppercase tracking-wider text-blue-600 mt-2 block">{profile?.role}</p>
          </div>

          <div className="w-full border-t border-stone-100 pt-6 mt-2">
            <h4 className="font-bold text-stone-900 mb-4 text-center">Opções de Foto</h4>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button 
                variant="secondary" 
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
              >
                {isUploading ? 'Enviando...' : 'Enviar Nova Foto'}
              </Button>
              {user.photoURL && (
                <Button 
                  variant="secondary" 
                  onClick={handleUseGooglePhoto}
                >
                  Usar Foto do Google
                </Button>
              )}
            </div>
          </div>
        </div>
      </Card>
    </motion.div>
  );
}

function CompetitionView({ registrations, athletes, academies }: { registrations: Registration[]; athletes: Athlete[]; academies: Academy[] }) {
  const [selectedCategory, setSelectedCategory] = useState<string>('Kyorugui');
  
  // Agrupar atletas por categoria de competição
  const groupedAthletes = useMemo(() => {
    const groups: Record<string, any[]> = {};
    
    registrations.filter(r => r.status === 'Confirmado' && r.categories.includes(selectedCategory as any)).forEach(reg => {
      const athlete = athletes.find(a => a.id === reg.athleteId);
      if (!athlete) return;
      
      const ageCat = getAgeCategory(athlete.birthDate, athlete.belt);
      const weightCat = getWeightCategory(ageCat, athlete.gender, athlete.weight, athlete.belt);
      const isDan = athlete.belt.includes('Dan') ? 'Preta' : 'Colorida';
      const genderStr = athlete.gender === 'M' ? 'Masculino' : 'Feminino';
      
      let groupKey = '';
      if (selectedCategory === 'Kyorugui') {
        groupKey = `${ageCat} | ${isDan} | ${genderStr} | ${weightCat}`;
      } else if (selectedCategory.includes('Kyopa')) {
        groupKey = `Categoria Única`;
      } else {
        groupKey = `${ageCat} | ${isDan} | ${genderStr}`;
      }
      
      if (!groups[groupKey]) {
        groups[groupKey] = [];
      }
      
      groups[groupKey].push({
        ...athlete,
        academy: academies.find(a => a.id === athlete.academyId)?.name || 'Desconhecida'
      });
    });
    
    return groups;
  }, [registrations, athletes, academies, selectedCategory]);

  return (
    <div className="space-y-6">
      <div className="flex gap-2 overflow-x-auto pb-2">
        {['Kyorugui', 'Poomsae', 'Kyopa (3 tábuas)', 'Kyopa (5 tábuas)'].map(cat => (
          <button
            key={cat}
            onClick={() => setSelectedCategory(cat)}
            className={cn(
              "px-4 py-2 rounded-full text-sm font-bold whitespace-nowrap transition-all",
              selectedCategory === cat ? "bg-red-600 text-white shadow-md" : "bg-stone-100 text-stone-600 hover:bg-stone-200"
            )}
          >
            {cat}
          </button>
        ))}
      </div>

      {Object.keys(groupedAthletes).length === 0 ? (
        <Card className="p-12 text-center text-stone-500">
          <Trophy className="w-12 h-12 mx-auto mb-4 text-stone-300" />
          <p>Nenhum atleta confirmado nesta categoria ainda.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {Object.entries(groupedAthletes).sort(([a], [b]) => a.localeCompare(b)).map(([groupKey, groupAthletes]: [string, any[]]) => (
            <Card key={groupKey} className="p-6 border-t-4 border-t-red-600">
              <h3 className="font-bold text-stone-900 mb-4 pb-2 border-b border-stone-100">{groupKey}</h3>
              <div className="space-y-3">
                {groupAthletes.map((athlete, idx) => (
                  <div key={athlete.id} className="flex items-center justify-between p-3 bg-stone-50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className="w-6 h-6 rounded-full bg-red-100 text-red-700 flex items-center justify-center text-xs font-bold">
                        {idx + 1}
                      </div>
                      <div>
                        <p className="font-bold text-sm text-stone-900">{athlete.name}</p>
                        <p className="text-xs text-stone-500">{athlete.academy} • {athlete.belt}</p>
                      </div>
                    </div>
                    <span className="text-xs font-bold text-stone-400">{athlete.weight}kg</span>
                  </div>
                ))}
              </div>
              {groupAthletes.length === 1 && (
                <div className="mt-4 p-3 bg-amber-50 text-amber-800 text-xs rounded-lg flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" />
                  Atleta sozinho na chave. Necessário remanejamento.
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function AdminView({ profile, registrations, athletes, academies, receipts, settings, key }: { profile: UserProfile | null; registrations: Registration[]; athletes: Athlete[]; academies: Academy[]; receipts: any[]; settings: any; key?: string }) {
  const [adminTab, setAdminTab] = useState<'finance' | 'competition'>('finance');

  const calculatePrice = (categories: string[]) => {
    let total = 0;
    if (categories.includes('Kyorugui') || categories.includes('Poomsae')) {
      total += 90;
    }
    if (categories.includes('Kyopa (3 tábuas)')) total += 25;
    if (categories.includes('Kyopa (5 tábuas)')) total += 35;
    return total;
  };

  const academyStats = academies.map(academy => {
    const academyRegs = registrations.filter(r => r.academyId === academy.id);
    const totalValue = academyRegs.reduce((sum, r) => sum + calculatePrice(r.categories), 0);
    const paidValue = academyRegs.filter(r => r.paymentStatus === 'Pago').reduce((sum, r) => sum + calculatePrice(r.categories), 0);
    const pendingValue = totalValue - paidValue;
    
    return {
      ...academy,
      totalRegs: academyRegs.length,
      totalValue,
      paidValue,
      pendingValue,
      pendingRegs: academyRegs.filter(r => r.paymentStatus === 'Pendente' || r.paymentStatus === 'Em Análise')
    };
  }).filter(a => a.totalRegs > 0);

  const handleApproveAll = async (academyId: string) => {
    if (!window.confirm('Aprovar todos os pagamentos pendentes desta academia?')) return;
    
    const pendingRegs = registrations.filter(r => r.academyId === academyId && (r.paymentStatus === 'Pendente' || r.paymentStatus === 'Em Análise'));
    
    try {
      await Promise.all(pendingRegs.map(reg => 
        updateDoc(doc(db, 'registrations', reg.id), {
          paymentStatus: 'Pago',
          status: 'Confirmado'
        })
      ));

      // Delete receipts for this academy
      const academyReceipts = receipts.filter(r => r.academyId === academyId);
      await Promise.all(academyReceipts.map(receipt => 
        deleteDoc(doc(db, 'receipts', receipt.id))
      ));

      const academy = academies.find(a => a.id === academyId);
      if (academy && academy.contact) {
        const formattedPhone = formatWhatsAppNumber(academy.contact);
        const text = `Olá Técnico(a) ${academy.coach}, os pagamentos pendentes da academia *${academy.name}* foram APROVADOS no 3º Festival União Lopes! As inscrições estão confirmadas. 🥋`;
        
        if (window.confirm('Pagamentos aprovados com sucesso! Deseja notificar a academia via WhatsApp?')) {
          window.open(`https://wa.me/${formattedPhone}?text=${encodeURIComponent(text)}`, '_blank');
        }
      } else {
        alert('Pagamentos aprovados com sucesso!');
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'registrations');
    }
  };

  const handleRejectReceipt = async (receiptId: string, academyId: string) => {
    if (!window.confirm('Rejeitar este comprovante? As inscrições voltarão para Pendente.')) return;
    
    const pendingRegs = registrations.filter(r => r.academyId === academyId && r.paymentStatus === 'Em Análise');
    
    try {
      await Promise.all(pendingRegs.map(reg => 
        updateDoc(doc(db, 'registrations', reg.id), {
          paymentStatus: 'Pendente'
        })
      ));
      
      await deleteDoc(doc(db, 'receipts', receiptId));
      
      const academy = academies.find(a => a.id === academyId);
      if (academy && academy.contact) {
        const formattedPhone = formatWhatsAppNumber(academy.contact);
        const text = `Olá Técnico(a) ${academy.coach}, houve um problema com o comprovante de pagamento enviado para a academia *${academy.name}* no 3º Festival União Lopes. As inscrições voltaram para o status Pendente. Por favor, verifique e envie novamente na plataforma. 🥋`;
        
        if (window.confirm('Comprovante rejeitado. Deseja notificar a academia via WhatsApp?')) {
          window.open(`https://wa.me/${formattedPhone}?text=${encodeURIComponent(text)}`, '_blank');
        }
      } else {
        alert('Comprovante rejeitado.');
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'receipts');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h2 className="text-2xl font-bold">Painel de Administração</h2>
        <div className="flex bg-stone-100 p-1 rounded-xl">
          <button 
            onClick={() => setAdminTab('finance')}
            className={cn("px-4 py-2 rounded-lg text-sm font-bold transition-all", adminTab === 'finance' ? "bg-white text-stone-900 shadow-sm" : "text-stone-500 hover:text-stone-700")}
          >
            Financeiro
          </button>
          <button 
            onClick={() => setAdminTab('competition')}
            className={cn("px-4 py-2 rounded-lg text-sm font-bold transition-all", adminTab === 'competition' ? "bg-white text-stone-900 shadow-sm" : "text-stone-500 hover:text-stone-700")}
          >
            Competição
          </button>
        </div>
      </div>

      {adminTab === 'finance' ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="p-6 bg-stone-900 text-white">
              <p className="text-stone-400 text-sm font-medium mb-1">Total Arrecadado</p>
              <p className="text-3xl font-bold">R$ {academyStats.reduce((sum, a) => sum + a.paidValue, 0).toFixed(2).replace('.', ',')}</p>
            </Card>
            <Card className="p-6 bg-amber-50 border-amber-200">
              <p className="text-amber-600 text-sm font-medium mb-1">Total Pendente</p>
              <p className="text-3xl font-bold text-amber-900">R$ {academyStats.reduce((sum, a) => sum + a.pendingValue, 0).toFixed(2).replace('.', ',')}</p>
            </Card>
        <Card className="p-6">
          <p className="text-stone-500 text-sm font-medium mb-1">Total de Inscrições</p>
          <p className="text-3xl font-bold text-stone-900">{registrations.length}</p>
        </Card>
      </div>

      <div className="space-y-4">
        <h3 className="text-xl font-bold pt-4">Configurações</h3>
        <Card className="p-6 flex flex-col md:flex-row justify-between items-center gap-4">
          <div>
            <h4 className="font-bold text-lg text-stone-900">Mercado Pago</h4>
            <p className="text-sm text-stone-500">Ativar ou desativar o botão de pagamento via Mercado Pago para as academias.</p>
          </div>
          <button
            onClick={async () => {
              try {
                await setDoc(doc(db, 'settings', 'payment'), {
                  mercadoPagoEnabled: !settings.mercadoPagoEnabled
                }, { merge: true });
              } catch (e) {
                alert('Erro ao atualizar configuração.');
              }
            }}
            className={`w-14 h-8 rounded-full transition-colors relative ${settings.mercadoPagoEnabled ? 'bg-blue-600' : 'bg-stone-300'}`}
          >
            <div className={`w-6 h-6 rounded-full bg-white absolute top-1 transition-transform ${settings.mercadoPagoEnabled ? 'left-7' : 'left-1'}`} />
          </button>
        </Card>

        <Card className="p-6 space-y-4">
          <div>
            <h4 className="font-bold text-lg text-stone-900">Imagens do Sistema</h4>
            <p className="text-sm text-stone-500">Altere a URL das imagens usadas no festival.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-stone-700">Logo do Festival (URL)</label>
              <input 
                type="text"
                className="w-full p-3 border border-stone-200 rounded-xl focus:ring-2 focus:ring-red-600 focus:border-transparent"
                placeholder="Ex: https://..."
                defaultValue={settings.festivalLogo || ''}
                onBlur={async (e) => {
                  try {
                    await setDoc(doc(db, 'settings', 'payment'), {
                      festivalLogo: e.target.value
                    }, { merge: true });
                  } catch (err) {
                    console.error(err);
                  }
                }}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-stone-700">Imagem da Homenagem (URL)</label>
              <input 
                type="text"
                className="w-full p-3 border border-stone-200 rounded-xl focus:ring-2 focus:ring-red-600 focus:border-transparent"
                placeholder="Ex: https://..."
                defaultValue={settings.tributeImage || ''}
                onBlur={async (e) => {
                  try {
                    await setDoc(doc(db, 'settings', 'payment'), {
                      tributeImage: e.target.value
                    }, { merge: true });
                  } catch (err) {
                    console.error(err);
                  }
                }}
              />
            </div>
          </div>
        </Card>
      </div>

      <div className="space-y-4">
        <h3 className="text-xl font-bold pt-4">Resumo por Academia</h3>
        {academyStats.map(stat => (
          <Card key={stat.id} className="p-6 flex flex-col md:flex-row justify-between items-center gap-4">
            <div>
              <h4 className="font-bold text-lg text-stone-900">{stat.name}</h4>
              <p className="text-sm text-stone-500">{stat.totalRegs} inscrições no total</p>
            </div>
            
            <div className="flex gap-8 text-right">
              <div>
                <p className="text-xs font-bold text-stone-400 uppercase tracking-wider">Pendente</p>
                <p className="font-bold text-amber-600">R$ {stat.pendingValue.toFixed(2).replace('.', ',')}</p>
              </div>
              <div>
                <p className="text-xs font-bold text-stone-400 uppercase tracking-wider">Pago</p>
                <p className="font-bold text-emerald-600">R$ {stat.paidValue.toFixed(2).replace('.', ',')}</p>
              </div>
              <div>
                <p className="text-xs font-bold text-stone-400 uppercase tracking-wider">Total</p>
                <p className="font-bold text-stone-900">R$ {stat.totalValue.toFixed(2).replace('.', ',')}</p>
              </div>
            </div>

            {stat.pendingValue > 0 && (
              <div className="flex flex-col gap-2">
                <Button onClick={() => handleApproveAll(stat.id)} className="whitespace-nowrap">
                  Aprovar Pendentes
                </Button>
                {receipts.filter(r => r.academyId === stat.id).map(receipt => (
                  <div key={receipt.id} className="flex flex-col gap-2 mt-2 p-3 bg-amber-50 rounded-xl border border-amber-200">
                    <p className="text-xs font-bold text-amber-900">Comprovante Enviado</p>
                    <div className="flex gap-2">
                      <a 
                        href={receipt.receiptData} 
                        download={`comprovante-${stat.name}.png`}
                        className="text-xs py-1 px-2 h-auto flex-1 bg-white text-stone-900 border border-stone-200 rounded-xl font-medium flex items-center justify-center hover:bg-stone-50 transition-colors"
                      >
                        Ver Comprovante
                      </a>
                      <Button 
                        variant="ghost" 
                        className="text-xs py-1 px-2 h-auto text-red-600 hover:bg-red-50"
                        onClick={() => handleRejectReceipt(receipt.id, stat.id)}
                      >
                        Rejeitar
                      </Button>
                    </div>

                    {stat.pendingRegs.length > 0 && (
                      <div className="mt-2 pt-2 border-t border-amber-200/50">
                        <p className="text-[10px] font-bold text-amber-900 uppercase tracking-wider mb-2">Inscrições neste Comprovante</p>
                        <div className="space-y-1.5 max-h-32 overflow-y-auto pr-1">
                          {stat.pendingRegs.map(reg => {
                            const athlete = athletes.find(a => a.id === reg.athleteId);
                            return (
                              <div key={reg.id} className="flex justify-between items-center text-xs">
                                <span className="font-medium text-stone-700 truncate mr-2">{athlete?.name || 'Atleta desconhecido'}</span>
                                <span className="text-stone-500 whitespace-nowrap">{reg.categories.join(', ')}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>
        ))}
        {academyStats.length === 0 && (
          <p className="text-stone-500 text-center py-10">Nenhuma inscrição registrada ainda.</p>
        )}
      </div>
        </>
      ) : (
        <CompetitionView registrations={registrations} athletes={athletes} academies={academies} />
      )}
    </div>
  );
}
