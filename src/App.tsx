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
  MapPin,
  CreditCard,
  FileText,
  CheckCircle,
  Copy,
  ExternalLink
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { motion, AnimatePresence } from 'motion/react';
import { Button, Card, Input, Select, cn } from './components/ui';


const UNIAO_LOPES_LOGO = "/logo-colombo.png";

const formatWhatsAppNumber = (phone: string) => {
  const cleaned = phone.replace(/\D/g, '');
  return cleaned.length === 11 ? `55${cleaned}` : cleaned;
};

// --- PIX Generator Helpers ---
const crc16 = (str: string): string => {
  let crc = 0xFFFF;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      if ((crc & 0x8000) !== 0) {
        crc = (crc << 1) ^ 0x1021;
      } else {
        crc <<= 1;
      }
    }
  }
  return (crc & 0xFFFF).toString(16).toUpperCase().padStart(4, '0');
};

const generatePix = (amount: number, description: string = "Inscrição Fest 2026", txId: string = "***") => {
  const basePix = "00020126580014BR.GOV.BCB.PIX0136f54e22ce-2771-4a78-a5c3-3dde26d19329520400005303986";
  const amountStr = amount.toFixed(2);
  const tag54 = `54${amountStr.length.toString().padStart(2, '0')}${amountStr}`;
  const country = "5802BR";
  const merchant = "5913Leonardo Reis6009SAO PAULO";
  
  // Tag 62 (Additional Data Field Template)
  // Sub-tag 05 (Transaction ID)
  const tag62_05 = `05${txId.length.toString().padStart(2, '0')}${txId}`;
  
  // Sub-tag 02 (Description) - Opcional, mas alguns bancos mostram
  const cleanDescription = description.normalize("NFD").replace(/[\u0300-\u036f]/g, "").substring(0, 25);
  const tag62_02 = `02${cleanDescription.length.toString().padStart(2, '0')}${cleanDescription}`;
  
  const tag62Value = tag62_02 + tag62_05;
  const tag62 = `62${tag62Value.length.toString().padStart(2, '0')}${tag62Value}`;
  
  const payload = basePix + tag54 + country + merchant + tag62 + "6304";
  return payload + crc16(payload);
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
  const [viewingReceipt, setViewingReceipt] = useState<string | null>(null);

  useEffect(() => {
    document.title = "3º Festival União Lopes - Portal";
  }, []);

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        try {
          const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
          const adminEmails = ['leo@laravitoria.com', 'tauyllin.edfisica@hotmail.com', 'tauyllin.tkd@gmail.com'];
          const isSystemAdmin = adminEmails.includes(firebaseUser.email || '');

          if (userDoc.exists()) {
            const userData = userDoc.data() as UserProfile;
            if (isSystemAdmin && userData.role !== 'admin') {
              // Upgrade existing user to admin if they are in the white-list
              await updateDoc(doc(db, 'users', firebaseUser.uid), { role: 'admin' });
              setProfile({ ...userData, uid: firebaseUser.uid, role: 'admin' });
            } else {
              setProfile({ uid: firebaseUser.uid, ...userData } as UserProfile);
            }
          } else {
            // New user defaults to master unless in the admin list
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
      <div className="min-h-screen flex items-center justify-center bg-stone-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-stone-900"></div>
      </div>
    );
  }

  if (!user) {
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
          <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 brightness-100 contrast-150 mix-blend-overlay z-0"></div>
          
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
              <span>Ambiente Seguro • Associação Colombo</span>
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
          <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 mix-blend-overlay" />
        </div>

        {/* Sidebar */}
        <aside className="w-72 bg-stone-900/40 backdrop-blur-3xl border-r border-white/5 flex flex-col hidden md:flex z-50">
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
            <NavItem active={view === 'dashboard'} onClick={() => setView('dashboard')} icon={<Users className="w-5 h-5" />} label="Dashboard" />
            <NavItem active={view === 'academy'} onClick={() => setView('academy')} icon={<School className="w-5 h-5" />} label="Minha Academia" />
            <NavItem active={view === 'athletes'} onClick={() => setView('athletes')} icon={<UserPlus className="w-5 h-5" />} label="Atletas" />
            <NavItem active={view === 'registrations'} onClick={() => setView('registrations')} icon={<Calendar className="w-5 h-5" />} label="Inscrições" />
            {profile?.role === 'admin' && (
              <NavItem active={view === 'admin'} onClick={() => setView('admin')} icon={<Shield className="w-5 h-5" />} label="Administração" />
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
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto z-40 relative">
          <div className="p-6 lg:p-12">
            <div className="max-w-7xl mx-auto space-y-12">
              <header className="flex items-center justify-between pb-8 border-b border-white/5">
                <div>
                  <h1 className="text-3xl font-black text-white uppercase italic tracking-tighter leading-none">
                    {view === 'dashboard' && 'Visão Geral'}
                    {view === 'academy' && 'Minha Academia'}
                    {view === 'athletes' && 'Gestão de Atletas'}
                    {view === 'registrations' && 'Inscrições Ativas'}
                    {view === 'admin' && 'Painel Administrativo'}
                    {view === 'profile' && 'Configurações de Perfil'}
                  </h1>
                  <p className="text-stone-500 text-sm font-bold uppercase tracking-widest mt-2 flex items-center gap-2">
                    <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                    Portal Fest 2026 • Ambiente Seguro
                  </p>
                </div>
              </header>

              <AnimatePresence mode="wait">
                {view === 'dashboard' && <DashboardView key="dashboard" profile={profile} stats={{ academies: academies.length, athletes: athletes.length, registrations: registrations.length }} settings={settings} />}
                {view === 'academy' && <AcademyView key="academy" profile={profile} academies={academies} />}
                {view === 'athletes' && <AthletesView key="athletes" profile={profile} user={user} athletes={athletes} academies={academies} registrations={registrations} />}
                {view === 'registrations' && <RegistrationsView key="registrations" profile={profile} registrations={registrations} athletes={athletes} academies={academies} receipts={receipts} settings={settings} onViewReceipt={setViewingReceipt} />}
                {view === 'admin' && <AdminView key="admin" profile={profile} user={user} registrations={registrations} athletes={athletes} academies={academies} receipts={receipts} settings={settings} onViewReceipt={setViewingReceipt} />}
                {view === 'profile' && <ProfileView key="profile" profile={profile} user={user} />}
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

function DashboardView({ stats, profile, settings, key }: { stats: { academies: number; athletes: number; registrations: number }; profile: UserProfile | null; settings?: any; key?: string }) {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-12"
    >
      <TributeCard settings={settings} />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatCard icon={<School className="w-6 h-6" />} label="Academias" value={stats.academies} color="from-blue-600 to-blue-400" />
        <StatCard icon={<Users className="w-6 h-6" />} label="Atletas Cadastrados" value={stats.athletes} color="from-emerald-600 to-emerald-400" />
        <StatCard icon={<Trophy className="w-6 h-6" />} label="Inscrições Ativas" value={stats.registrations} color="from-amber-600 to-amber-400" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <Card className="p-8 border-white/5 bg-gradient-to-br from-white/[0.03] to-transparent">
          <h3 className="text-xl font-black text-white italic uppercase tracking-tighter mb-6">Próximos Passos</h3>
          <div className="space-y-6">
            <StepItem done={stats.academies > 0} label="Cadastrar sua Academia" description="Defina o nome e mestre responsável no menu 'Minha Academia'." />
            <StepItem done={stats.athletes > 0} label="Cadastrar Atletas" description="Adicione os alunos que irão participar no menu 'Atletas'." />
            <StepItem done={stats.registrations > 0} label="Realizar Inscrições" description="Escolha as categorias para cada atleta no menu 'Inscrições'." />
          </div>
        </Card>

        <Card className="p-8 bg-stone-900/60 border-red-600/20 relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-red-600/5 rounded-full blur-3xl group-hover:bg-red-600/10 transition-colors" />
          <h3 className="text-xl font-black text-white italic uppercase tracking-tighter mb-2">Informações do Festival</h3>
          <p className="text-red-500 text-[10px] font-black uppercase tracking-[0.2em] mb-8">3º Festival União Lopes 2026</p>
          
          <div className="space-y-6">
            <div className="flex items-center gap-4 group/item">
              <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center border border-white/10 group-hover/item:border-red-500/50 transition-colors">
                <Calendar className="w-5 h-5 text-red-500" />
              </div>
              <div>
                <p className="text-sm font-black text-white uppercase tracking-tight">12 de Abril, 2026</p>
                <p className="text-[10px] text-stone-500 uppercase font-bold tracking-widest">Domingo • 08:00 às 19:00</p>
              </div>
            </div>
            <div className="flex items-center gap-4 group/item">
              <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center border border-white/10 group-hover/item:border-blue-500/50 transition-colors">
                <Shield className="text-blue-500 w-5 h-5" />
              </div>
              <div>
                <p className="text-sm font-black text-white uppercase tracking-tight">C. E. Cívico-Militar Alfredo Chaves</p>
                <p className="text-[10px] text-stone-500 uppercase font-bold tracking-widest">Colombo, PR • Rio Verde</p>
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
    <Card className="p-6 flex items-center gap-6 group hover:border-white/10 transition-colors">
      <div className={cn('w-16 h-16 rounded-2xl flex items-center justify-center text-white shadow-2xl bg-gradient-to-br', color)}>
        {icon}
      </div>
      <div>
        <p className="text-[10px] font-black text-stone-500 uppercase tracking-[0.2em] mb-1">{label}</p>
        <p className="text-4xl font-black text-white tracking-tighter">{value}</p>
      </div>
    </Card>
  );
}

function TributeCard({ settings }: { settings?: any }) {
  const tributeImage = settings?.tributeImage || "/tribute.jpg";
  
  return (
    <Card className="p-8 bg-black/40 border-white/5 relative overflow-hidden group">
      <div className="absolute top-0 right-0 w-64 h-64 bg-red-600/10 rounded-full blur-[100px] -mr-32 -mt-32 group-hover:bg-red-600/20 transition-all duration-700" />
      <div className="relative z-10 flex flex-col md:flex-row gap-8 items-center md:items-start">
        <div className="relative">
          <div className="absolute inset-0 bg-red-600/20 rounded-full blur-2xl animate-pulse" />
          <div className="w-32 h-32 shrink-0 rounded-full overflow-hidden border-2 border-red-500/50 shadow-[0_0_30px_rgba(220,38,38,0.3)] relative z-10">
            <img 
              src={tributeImage}
              alt="Homenagem" 
              className="w-full h-full object-cover scale-110 group-hover:scale-125 transition-transform duration-700"
            />
          </div>
        </div>
        <div className="space-y-4 text-center md:text-left">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-red-600/10 border border-red-500/20 text-[10px] font-black text-red-500 uppercase tracking-[0.2em]">
            <Trophy className="w-3 h-3" />
            Homenagem Especial
          </div>
          <h3 className="text-3xl font-black text-white italic tracking-tighter uppercase leading-none">Mestre Chuck Norris</h3>
          <p className="text-stone-400 text-sm font-bold uppercase tracking-[0.1em]">O Legado Indomável • Embaixador Global</p>
          <p className="text-stone-300 text-sm leading-relaxed max-w-2xl font-medium opacity-80">
            "O Taekwondo não é apenas luta, é o desenvolvimento da mente e do espírito." Homenageamos aquele que elevou nossa arte ao cenário mundial com honra, disciplina e o verdadeiro espírito marcial.
          </p>
        </div>
      </div>
    </Card>
  );
}

function StepItem({ done, label, description }: { done: boolean; label: string; description: string }) {
  return (
    <div className="flex gap-5 group/step">
      <div className={cn(
        'w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 transition-all duration-300',
        done 
          ? 'bg-emerald-500 text-white shadow-[0_0_15px_rgba(16,185,129,0.3)]' 
          : 'bg-white/5 text-stone-600 border border-white/10 group-hover/step:border-white/20'
      )}>
        {done ? <CheckCircle2 className="w-5 h-5" /> : <div className="w-2 h-2 rounded-full bg-stone-700" />}
      </div>
      <div>
        <p className={cn('text-sm font-black uppercase tracking-tight transition-colors', done ? 'text-stone-500 line-through' : 'text-white')}>{label}</p>
        <p className="text-xs text-stone-500 font-bold uppercase tracking-widest mt-1">{description}</p>
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
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
      <header className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-black text-white italic uppercase tracking-tighter">Minha Academia</h2>
          <p className="text-[10px] text-stone-500 font-bold uppercase tracking-widest mt-1">Gerencie os dados da sua equipe</p>
        </div>
        {!isAdding && (
          <Button onClick={() => setIsAdding(true)} variant="primary" className="flex items-center gap-2">
            <Plus className="w-5 h-5" /> 
            <span>Nova Academia</span>
          </Button>
        )}
      </header>

      {isAdding ? (
        <Card className="p-8 max-w-2xl mx-auto border-white/5 shadow-red-600/5">
          <form onSubmit={handleSubmit} className="space-y-8">
            <h3 className="text-xl font-black text-white italic uppercase tracking-tighter border-b border-white/5 pb-4">
              {editingId ? 'Editar Detalhes' : 'Nova Inscrição de Academia'}
            </h3>
            
            <div className="flex flex-col items-center gap-4 mb-8">
              <div className="relative group/photo">
                <div className="absolute inset-0 bg-red-600/20 rounded-full blur-2xl opacity-0 group-hover/photo:opacity-100 transition-opacity" />
                {formData.logo ? (
                  <img src={formData.logo} alt="Logo" className="w-32 h-32 rounded-3xl border-2 border-white/10 shadow-2xl object-cover bg-white/5 relative z-10" />
                ) : (
                  <div className="w-32 h-32 rounded-3xl border-2 border-white/10 shadow-2xl bg-white/5 flex items-center justify-center relative z-10">
                    <School className="w-12 h-12 text-stone-700" />
                  </div>
                )}
                <button 
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="absolute -bottom-2 -right-2 p-3 bg-red-600 text-white rounded-2xl shadow-xl hover:bg-red-500 transition-all z-20 hover:scale-110 active:scale-90"
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
              <p className="text-[10px] text-stone-500 font-black uppercase tracking-widest">Escudo da Academia</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
                  label="Nome Personalizado" 
                  placeholder="Ex: União Lopes Matriz" 
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  required
                />
              )}

              <Input 
                label="Técnico Responsável" 
                placeholder="Nome do Técnico" 
                value={formData.coach}
                onChange={e => setFormData({ ...formData, coach: e.target.value })}
                required
              />
              <Input 
                label="WhatsApp de Contato" 
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
            </div>

            <div className="flex flex-col sm:flex-row gap-4 pt-6 border-t border-white/5">
              <Button type="submit" className="flex-1 py-4 text-sm">{editingId ? 'Salvar Alterações' : 'Confirmar Cadastro'}</Button>
              <Button type="button" variant="secondary" className="flex-1 py-4 text-sm" onClick={() => {
                setIsAdding(false);
                setEditingId(null);
                setFormData({ name: '', coach: '', master: '', contact: '', logo: '' });
                setIsCustomName(false);
              }}>Cancelar</Button>
            </div>
            
            <div className="pt-4 flex justify-center">
              <button 
                type="button" 
                className="text-[10px] font-black text-stone-600 hover:text-red-500 transition-colors uppercase tracking-[0.2em]"
                onClick={() => setFormData(prev => ({ ...prev, logo: UNIAO_LOPES_LOGO }))}
              >
                Resetar para Logo Oficial Festival
              </button>
            </div>
          </form>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {academies.map(academy => (
            <Card key={academy.id} className="p-8 group hover:border-red-600/30 transition-all duration-500 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-red-600/5 rounded-full blur-3xl group-hover:bg-red-600/10 transition-colors" />
              <div className="relative z-10">
                <div className="flex justify-between items-start mb-6">
                  <div className="flex gap-4 items-center">
                    {academy.logo ? (
                      <img src={academy.logo} alt={academy.name} className="w-20 h-20 rounded-2xl object-cover bg-white/5 border border-white/10 p-1 shadow-2xl" />
                    ) : (
                      <div className="w-20 h-20 bg-white/5 border border-white/10 rounded-2xl flex items-center justify-center p-1 shadow-2xl">
                        <School className="w-10 h-10 text-stone-700" />
                      </div>
                    )}
                    <div>
                      <h4 className="text-2xl font-black text-white italic tracking-tighter uppercase leading-none">{academy.name}</h4>
                      <div className="mt-2 flex items-center gap-2">
                        <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                        <span className="text-[10px] font-black text-stone-500 uppercase tracking-widest italic">Academia Ativa</span>
                      </div>
                    </div>
                  </div>
                  <Button variant="ghost" className="p-3 bg-white/5 hover:bg-red-600/20 group/edit" onClick={() => handleEdit(academy)}>
                    <Edit className="w-4 h-4 group-hover/edit:text-red-500 transition-colors" />
                  </Button>
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mt-8 p-4 bg-white/[0.02] rounded-2xl border border-white/5">
                  <div className="space-y-1">
                    <p className="text-[10px] font-black text-stone-500 uppercase tracking-widest">Técnico Principal</p>
                    <p className="text-sm font-bold text-white uppercase">{academy.coach}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] font-black text-stone-500 uppercase tracking-widest">Mestre Responsável</p>
                    <p className="text-sm font-bold text-white uppercase">{academy.master}</p>
                  </div>
                  <div className="col-span-full space-y-1">
                    <p className="text-[10px] font-black text-stone-500 uppercase tracking-widest">WhatsApp / Contato</p>
                    <p className="text-sm font-bold text-white">{academy.contact}</p>
                  </div>
                </div>
              </div>
            </Card>
          ))}
          {academies.length === 0 && (
            <div className="col-span-full py-32 rounded-3xl border-2 border-dashed border-white/5 flex flex-col items-center justify-center gap-6 group hover:border-white/10 transition-colors">
              <div className="w-24 h-24 bg-white/5 rounded-full flex items-center justify-center border border-white/5 group-hover:scale-110 transition-transform duration-500">
                <School className="w-10 h-10 text-stone-700" />
              </div>
              <div className="text-center space-y-2">
                <p className="text-xl font-black text-white italic uppercase tracking-tighter">Nenhuma Academia</p>
                <p className="text-[10px] text-stone-600 uppercase font-black tracking-widest">Clique em "Nova Academia" para começar</p>
              </div>
              <Button onClick={() => setIsAdding(true)} variant="primary" className="px-10 py-4"><Plus className="w-5 h-5" /> Cadastrar agora</Button>
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

function BeltBadge({ belt, size = 'md' }: { belt: string; size?: 'sm' | 'md' | 'lg' }) {
  let style: React.CSSProperties = {};
  let className = "px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest inline-flex items-center gap-1.5 border ";
  
  // Custom Gradients for striped belts
  if (belt.includes('Branca/Amarela')) {
    style = { background: 'linear-gradient(90deg, #ffffff 50%, #facc15 50%)', color: '#000', borderColor: 'rgba(255,255,255,0.2)' };
  } else if (belt.includes('Amarela/Verde')) {
    style = { background: 'linear-gradient(90deg, #facc15 50%, #22c55e 50%)', color: '#000', borderColor: 'rgba(255,255,255,0.2)' };
  } else if (belt.includes('Verde/Azul')) {
    style = { background: 'linear-gradient(90deg, #22c55e 50%, #3b82f6 50%)', color: '#fff', borderColor: 'rgba(255,255,255,0.2)' };
  } else if (belt.includes('Azul/Vermelha')) {
    style = { background: 'linear-gradient(90deg, #3b82f6 50%, #ef4444 50%)', color: '#fff', borderColor: 'rgba(255,255,255,0.2)' };
  } else if (belt.includes('Vermelha/Preta')) {
    style = { background: 'linear-gradient(90deg, #ef4444 50%, #000000 50%)', color: '#fff', borderColor: 'rgba(255,255,255,0.2)' };
  } 
  // Solid belts
  else if (belt.includes('Branca')) {
    className += 'bg-white text-black border-white/20';
  } else if (belt.includes('Cinza')) {
    className += 'bg-stone-500 text-white border-white/10';
  } else if (belt.includes('Amarela')) {
    className += 'bg-yellow-400 text-black border-yellow-500/50';
  } else if (belt.includes('Laranja')) {
    className += 'bg-orange-500 text-white border-orange-600/50';
  } else if (belt.includes('Verde Claro')) {
    className += 'bg-emerald-400 text-black border-emerald-500/50';
  } else if (belt.includes('Verde Escuro')) {
    className += 'bg-emerald-900 text-white border-emerald-800/50';
  } else if (belt.includes('Azul Claro')) {
    className += 'bg-sky-400 text-black border-sky-500/50';
  } else if (belt.includes('Azul Escuro')) {
    className += 'bg-blue-800 text-white border-blue-700/50';
  } else if (belt.includes('Vermelha Escura') || belt.includes('Bordô')) {
    className += 'bg-red-900 text-white border-red-800/50';
  } else if (belt.includes('Vermelha')) {
    className += 'bg-red-600 text-white border-red-500/50';
  } else if (belt.includes('Preta')) {
    className += 'bg-stone-950 text-white border-white/20 shadow-[0_0_10px_rgba(255,255,255,0.1)]';
  } else {
    className += 'bg-white/5 text-stone-400 border-white/5';
  }

  return (
    <span className={className} style={style}>
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-50" />
      {belt}
    </span>
  );
}

function AthletesView({ profile, user, athletes, academies, registrations, key }: { profile: UserProfile | null; user: User | null; athletes: Athlete[]; academies: Academy[]; registrations: Registration[]; key?: string }) {
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
        const hasRegistrations = registrations.some(r => r.athleteId === editingId);
        if (hasRegistrations) {
            const original = athletes.find(a => a.id === editingId);
            if (original && (original.birthDate !== formData.birthDate || original.gender !== formData.gender || original.weight !== formData.weight)) {
                if (!window.confirm("ATENÇÃO: Este atleta possui inscrições ativas.\n\nA alteração de Nascimento, Gênero ou Peso pode afetar o enquadramento em categorias.\n\nDeseja forçar a edição?")) {
                    return;
                }
            }
        }
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
    const athleteRegs = registrations.filter(r => r.athleteId === id);
    if (athleteRegs.length > 0) {
      alert(`SISTEMA DE SEGURANÇA\nEste atleta possui ${athleteRegs.length} inscrição(ões) ativa(s).\nRemova as inscrições antes de excluir o atleta.`);
      return;
    }

    if (window.confirm('Confirmar exclusão permanente deste atleta?')) {
      try {
        await deleteDoc(doc(db, 'athletes', id));
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, 'athletes');
      }
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
      <header className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-black text-white italic uppercase tracking-tighter">Gestão de Atletas</h2>
          <p className="text-[10px] text-stone-500 font-bold uppercase tracking-widest mt-1">Inscreva e organize seus competidores</p>
        </div>
        {!isAdding && (
          <Button onClick={() => setIsAdding(true)} variant="primary" className="shadow-red-600/20">
            <Plus className="w-5 h-5" /> Novo Atleta
          </Button>
        )}
      </header>

      {isAdding ? (
        <Card className="p-8 max-w-2xl mx-auto border-white/5 shadow-2xl">
          <form onSubmit={handleSubmit} className="space-y-8">
            <div className="flex justify-between items-center border-b border-white/5 pb-4">
              <h3 className="text-xl font-black text-white italic uppercase tracking-tighter">
                {editingId ? 'Editar Cadastro' : 'Novo Competidor'}
              </h3>
              {!editingId && profile?.displayName && (
                <button 
                  type="button" 
                  className="text-[10px] font-black text-red-500 uppercase tracking-widest hover:text-red-400 transition-colors"
                  onClick={() => setFormData(prev => ({ 
                    ...prev, 
                    name: profile.displayName || user?.displayName || '', 
                    avatar: profile.photoURL || user?.photoURL || '',
                    birthDate: profile.birthDate || '',
                    gender: profile.gender || 'M'
                  }))}
                >
                  Usar meu Perfil
                </button>
              )}
            </div>

            <div className="flex flex-col items-center gap-4">
              <div className="relative group/photo">
                <div className="absolute inset-0 bg-red-600/10 rounded-full blur-2xl opacity-0 group-hover/photo:opacity-100 transition-opacity" />
                {formData.avatar ? (
                  <img src={formData.avatar} alt="Avatar" className="w-32 h-32 rounded-3xl object-cover border-2 border-white/10 shadow-2xl relative z-10" />
                ) : (
                  <div className="w-32 h-32 rounded-3xl bg-white/5 border-2 border-white/10 shadow-2xl flex items-center justify-center relative z-10">
                    <UserPlus className="w-12 h-12 text-stone-700" />
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                  className="absolute -bottom-2 -right-2 p-3 bg-red-600 text-white rounded-2xl hover:bg-red-500 transition-all z-20 hover:scale-110 shadow-xl"
                >
                  <Camera className="w-5 h-5" />
                </button>
                <input type="file" ref={fileInputRef} onChange={handlePhotoUpload} accept="image/*" className="hidden" />
              </div>
              <p className="text-[10px] text-stone-500 font-black uppercase tracking-widest">Foto de Identificação</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="md:col-span-2">
                <Input label="Nome Completo" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} required />
              </div>
              <Input label="Data de Nascimento" type="date" value={formData.birthDate} onChange={e => setFormData({ ...formData, birthDate: e.target.value })} required />
              <Select 
                label="Gênero" 
                options={[{ value: 'M', label: 'Masculino' }, { value: 'F', label: 'Feminino' }]} 
                value={formData.gender}
                onChange={e => setFormData({ ...formData, gender: e.target.value as 'M' | 'F' })}
                required
              />
              <Select 
                label="Graduação (Faixa)" 
                options={BELT_OPTIONS} 
                value={formData.belt}
                onChange={e => setFormData({ ...formData, belt: e.target.value })}
                required
              />
              <Input label="Peso Atual (kg)" type="number" step="0.1" value={formData.weight} onChange={e => setFormData({ ...formData, weight: Number(e.target.value) })} required />
              <div className="md:col-span-2">
                <Select 
                  label="Academia / Equipe" 
                  options={academies.map(a => ({ value: a.id, label: a.name }))} 
                  value={formData.academyId}
                  onChange={e => setFormData({ ...formData, academyId: e.target.value })}
                  required
                />
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-4 pt-6 border-t border-white/5">
              <Button type="submit" className="flex-1 py-4 text-sm">{editingId ? 'Salvar Alterações' : 'Confirmar Atleta'}</Button>
              <Button type="button" variant="secondary" className="flex-1 py-4 text-sm" onClick={() => {
                setIsAdding(false);
                setEditingId(null);
                setFormData({ name: '', birthDate: '', gender: 'M', belt: '', weight: 0, academyId: '', avatar: '' });
              }}>Cancelar</Button>
            </div>
          </form>
        </Card>
      ) : (
        <Card className="border-white/5 bg-white/[0.02]">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[800px]">
              <thead>
                <tr className="bg-white/5 border-b border-white/5">
                  <th className="px-8 py-5 text-[10px] font-black text-stone-500 uppercase tracking-[0.2em]">Competidor</th>
                  <th className="px-8 py-5 text-[10px] font-black text-stone-500 uppercase tracking-[0.2em]">Categoria Oficial</th>
                  <th className="px-8 py-5 text-[10px] font-black text-stone-500 uppercase tracking-[0.2em]">Graduação</th>
                  <th className="px-8 py-5 text-[10px] font-black text-stone-500 uppercase tracking-[0.2em]">Peso</th>
                  <th className="px-8 py-5 text-[10px] font-black text-stone-500 uppercase tracking-[0.2em]">Equipe</th>
                  <th className="px-8 py-5 text-[10px] font-black text-stone-500 uppercase tracking-[0.2em] text-center">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {athletes.map(athlete => {
                  const ageCat = getAgeCategory(athlete.birthDate, athlete.belt);
                  const weightCat = getWeightCategory(ageCat, athlete.gender, athlete.weight, athlete.belt);
                  return (
                  <tr key={athlete.id} className="hover:bg-white/[0.03] transition-colors group/row">
                    <td className="px-8 py-6">
                      <div className="flex items-center gap-4">
                        <div className="relative">
                          <div className="absolute inset-0 bg-red-600/20 rounded-2xl blur-lg opacity-0 group-hover/row:opacity-100 transition-opacity" />
                          {athlete.avatar ? (
                            <img src={athlete.avatar} alt={athlete.name} className="w-12 h-12 rounded-2xl object-cover border border-white/10 relative z-10 p-0.5 shadow-xl" />
                          ) : (
                            <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center text-stone-600 border border-white/10 relative z-10">
                              <span className="text-xl font-black uppercase select-none">{athlete.name.charAt(0)}</span>
                            </div>
                          )}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-black text-white uppercase tracking-tight leading-none">{athlete.name}</p>
                            {athlete.createdBy === profile?.uid && athlete.name === profile?.displayName && (
                              <span className="px-2 py-0.5 bg-blue-600/20 text-blue-400 text-[8px] font-black rounded uppercase tracking-widest border border-blue-500/20">Você</span>
                            )}
                          </div>
                          <p className="text-[10px] text-stone-500 uppercase font-bold tracking-widest mt-1.5 flex items-center gap-2">
                            <Calendar className="w-3 h-3" />
                            {new Date(athlete.birthDate).toLocaleDateString('pt-BR')}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-8 py-6">
                      <div className="space-y-1">
                        <p className="text-xs font-black text-white uppercase tracking-tighter">
                          {ageCat} • {athlete.gender === 'M' ? 'Masc' : 'Fem'}
                        </p>
                        <p className="text-[10px] text-stone-500 font-bold uppercase tracking-widest opacity-60">{weightCat}</p>
                      </div>
                    </td>
                    <td className="px-8 py-6">
                      <BeltBadge belt={athlete.belt} />
                    </td>
                    <td className="px-8 py-6">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-black text-white">{athlete.weight}</span>
                        <span className="text-[10px] font-bold text-stone-500 uppercase">kg</span>
                      </div>
                    </td>
                    <td className="px-8 py-6">
                      <p className="text-xs font-bold text-stone-400 uppercase tracking-wide">
                        {academies.find(a => a.id === athlete.academyId)?.name || 'N/A'}
                      </p>
                    </td>
                    <td className="px-8 py-6">
                      <div className="flex justify-center gap-2">
                        <Button variant="ghost" className="p-3 bg-white/5 hover:bg-emerald-600/20 group/edit" onClick={() => handleEdit(athlete)}>
                          <Edit className="w-4 h-4 group-hover/edit:text-emerald-500 transition-colors" />
                        </Button>
                        <Button variant="ghost" className="p-3 bg-white/5 hover:bg-red-600/20 group/del" onClick={() => handleDelete(athlete.id)}>
                          <Trash2 className="w-4 h-4 group-hover/del:text-red-500 transition-colors" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {athletes.length === 0 && (
            <div className="py-32 flex flex-col items-center justify-center gap-6">
              <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center border border-white/5">
                <UserPlus className="w-10 h-10 text-stone-800" />
              </div>
              <p className="text-[10px] text-stone-600 uppercase font-black tracking-widest">Nenhum atleta cadastrado nesta conta</p>
              <Button onClick={() => setIsAdding(true)} variant="secondary" className="px-8 py-3">Começar Cadastro</Button>
            </div>
          )}
        </Card>
      )}
    </motion.div>
  );
}

function RegistrationsView({ profile, registrations, athletes, academies, receipts, settings, onViewReceipt, key }: { profile: UserProfile | null; registrations: Registration[]; athletes: Athlete[]; academies: Academy[]; receipts: any[]; settings: any; onViewReceipt: (data: string) => void; key?: string }) {
  const [isAdding, setIsAdding] = useState(false);
  const [formData, setFormData] = useState({
    athleteId: '',
    categories: [] as ('Kyorugui' | 'Poomsae' | 'Kyopa (3 tábuas)' | 'Kyopa (5 tábuas)')[],
  });
  const [isUploadingReceipt, setIsUploadingReceipt] = useState(false);
  const [uploadingAcademyId, setUploadingAcademyId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const calculatePrice = (categories: string[]) => {
    let total = 0;
    if (categories.includes('Kyorugui') || categories.includes('Poomsae')) {
      total += 90;
    }
    if (categories.includes('Kyopa (3 tábuas)')) {
      total += 25;
    }
    if (categories.includes('Kyopa (5 tábuas)')) {
      total += 35;
    }
    return total;
  };

  const currentPrice = useMemo(() => calculatePrice(formData.categories), [formData.categories, settings]);

  const toggleCategory = (cat: 'Kyorugui' | 'Poomsae' | 'Kyopa (3 tábuas)' | 'Kyopa (5 tábuas)') => {
    setFormData(prev => ({
      ...prev,
      categories: prev.categories.includes(cat) 
        ? prev.categories.filter(c => c !== cat)
        : [...prev.categories, cat]
    }));
  };

  const handleReceiptUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !uploadingAcademyId) return;

    if (file.size > 800000) {
      alert('Arquivo muito grande (máx 800KB). Para arquivos maiores, use formatos comprimidos ou PDF.');
      return;
    }

    setIsUploadingReceipt(true);
    try {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64String = reader.result as string;
        await addDoc(collection(db, 'receipts'), {
          academyId: uploadingAcademyId,
          receiptData: base64String,
          createdAt: new Date().toISOString()
        });

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
      alert('Erro ao enviar comprovante.');
      setIsUploadingReceipt(false);
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

      setIsAdding(false);
      setFormData({ athleteId: '', categories: [] });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'registrations');
    }
  };

  const handleDeleteRegistration = async (id: string) => {
    if (window.confirm('Tem certeza que deseja cancelar esta inscrição?')) {
      try {
        await deleteDoc(doc(db, 'registrations', id));
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, 'registrations');
      }
    }
  };

  const myAcademyRegs = profile?.role === 'admin'
    ? registrations
    : registrations.filter(r => academies.some(a => a.id === r.academyId));
  
  const academiesWithPendingOrAnalysis = academies.filter(a => 
    registrations.some(r => r.academyId === a.id && (r.paymentStatus === 'Pendente' || r.paymentStatus === 'Em Análise'))
  );

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

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-10">
      <header className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-black text-white italic uppercase tracking-tighter">Inscrições</h2>
          <p className="text-[10px] text-stone-500 font-bold uppercase tracking-widest mt-1">Festival União Lopes 2026</p>
        </div>
        {!isAdding && athletes.length > 0 && (
          <Button onClick={() => setIsAdding(true)} variant="primary">
            <Plus className="w-5 h-5" /> Nova Inscrição
          </Button>
        )}
      </header>

      {!isAdding && academiesWithPendingOrAnalysis.map(academy => {
        const pendingRegs = registrations.filter(r => r.academyId === academy.id && r.paymentStatus === 'Pendente');
        const analysisRegs = registrations.filter(r => r.academyId === academy.id && r.paymentStatus === 'Em Análise');
        const totalPending = pendingRegs.reduce((sum, r) => sum + calculatePrice(r.categories), 0);
        const academyReceipts = receipts.filter(r => r.academyId === academy.id);

        return (
          <Card key={academy.id} className="p-0 border-white/5 bg-gradient-to-br from-amber-600/5 to-transparent overflow-hidden">
            <div className="p-8 flex flex-col lg:flex-row gap-10 items-start justify-between">
              <div className="flex-1 w-full flex flex-col h-full">
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-2 bg-amber-500/10 rounded-xl border border-amber-500/20">
                    <AlertCircle className="w-6 h-6 text-amber-500" />
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-white uppercase tracking-tighter italic">
                      {pendingRegs.length > 0 ? "Aguardando Pagamento" : "Em Análise de Comprovante"}
                    </h3>
                    <p className="text-[10px] text-amber-500/60 font-black uppercase tracking-[0.2em]">{academy.name}</p>
                  </div>
                </div>

                <div className="flex-1 bg-black/20 rounded-2xl border border-white/5 p-4 mb-6">
                  <p className="text-[10px] font-black text-stone-500 uppercase tracking-widest mb-4 ml-1">Atletas neste lote</p>
                  <div className="space-y-3 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
                    {[...pendingRegs, ...analysisRegs].map(reg => {
                      const athlete = athletes.find(a => a.id === reg.athleteId);
                      return (
                        <div key={reg.id} className="flex justify-between items-center group/item p-2 hover:bg-white/5 rounded-xl transition-colors">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center border border-white/5">
                              <span className="text-xs font-black text-white">{athlete?.name.charAt(0)}</span>
                            </div>
                            <div>
                              <p className="text-xs font-bold text-white uppercase tracking-tight">{athlete?.name}</p>
                              <p className="text-[8px] text-stone-500 font-bold uppercase tracking-widest">{reg.categories.join(' + ')}</p>
                            </div>
                          </div>
                          <p className="text-xs font-black text-white tabular-nums tracking-tighter">R$ {calculatePrice(reg.categories).toFixed(2).replace('.', ',')}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {pendingRegs.length > 0 && (
                  <div className="mt-auto">
                    <p className="text-[10px] font-black text-stone-500 uppercase tracking-widest mb-1 ml-1">Total deste Lote</p>
                    <p className="text-5xl font-black text-white tracking-tighter italic">R$ {totalPending.toFixed(2).replace('.', ',')}</p>
                  </div>
                )}
              </div>

              {pendingRegs.length > 0 ? (
                <div className="w-full lg:w-96 flex flex-col gap-6">
                  <div className="bg-white p-6 rounded-3xl shadow-[0_0_50px_rgba(255,255,255,0.05)] border-4 border-white/20 relative group/pix">
                    <div className="absolute inset-0 bg-red-600/5 rounded-[22px] blur-xl opacity-0 group-hover/pix:opacity-100 transition-opacity" />
                    <div className="relative z-10 flex flex-col items-center gap-4">
                      <QRCodeSVG 
                        value={generatePix(
                          totalPending, 
                          `Lote ${academy.name.substring(0, 10)}`, 
                          academy.id.substring(0, 5)
                        )} 
                        size={180} 
                        className="w-full h-auto max-w-[180px]" 
                      />
                      <div className="w-full space-y-3 mt-2">
                        <div className="space-y-1 mb-2">
                          <p className="text-[9px] font-black text-stone-500 uppercase tracking-widest pl-1">Descrição do Pagamento</p>
                          <div className="p-3 bg-black/40 border border-white/5 rounded-xl text-[9px] text-stone-300 font-bold uppercase leading-relaxed">
                            {pendingRegs.map(reg => {
                              const athlete = athletes.find(a => a.id === reg.athleteId);
                              return `${athlete?.name} (${reg.categories.join(' + ')})`;
                            }).join(', ')}
                          </div>
                        </div>
                        <p className="text-[10px] font-black text-stone-400 uppercase tracking-widest text-center mt-4">PIX Copia e Cola (Leonardo Reis)</p>
                        <div className="flex gap-2">
                          <input 
                            type="text" 
                            readOnly 
                            value={generatePix(
                              totalPending, 
                              `Lote ${academy.name.substring(0, 10)}`, 
                              academy.id.substring(0, 5)
                            )} 
                            className="w-full text-[10px] font-mono px-4 py-3 bg-black/40 border border-white/10 rounded-xl text-white outline-none focus:border-red-600/50 transition-all" 
                          />
                          <Button 
                            variant="primary" 
                            className="shrink-0 px-4 py-3 text-[10px] font-black uppercase tracking-widest flex items-center gap-2 group/copy"
                            onClick={() => {
                              navigator.clipboard.writeText(generatePix(
                                totalPending, 
                                `Lote ${academy.name.substring(0, 10)}`, 
                                academy.id.substring(0, 5)
                              ));
                              alert('Código PIX com valor e descrição automática copiado!');
                            }}
                          >
                            <Copy className="w-3.5 h-3.5 group-hover/copy:scale-110 transition-transform" />
                            <span>Copiar</span>
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">

                    <Button 
                      variant="primary" 
                      className="w-full py-5 rounded-2xl shadow-[0_0_30px_rgba(220,38,38,0.2)]"
                      onClick={() => {
                        setUploadingAcademyId(academy.id);
                        fileInputRef.current?.click();
                      }}
                      disabled={isUploadingReceipt}
                    >
                      {isUploadingReceipt ? 'Enviando...' : 'Anexar Comprovante'}
                    </Button>
                    <p className="text-[10px] text-stone-500 font-bold uppercase tracking-widest text-center leading-relaxed">
                      Lote será confirmado após<br/>validação manual do mestre
                    </p>
                  </div>
                </div>
              ) : (
                <div className="w-full lg:w-96 flex flex-col items-center justify-center p-12 bg-blue-600/5 rounded-[40px] border border-blue-500/20 gap-6">
                  <div className="w-20 h-20 rounded-3xl bg-blue-500/10 flex items-center justify-center border border-blue-500/20 group">
                    <Clock className="w-10 h-10 text-blue-500 group-hover:rotate-12 transition-transform" />
                  </div>
                  <div className="text-center space-y-2">
                    <h4 className="text-xl font-black text-white uppercase tracking-tighter italic">Em Análise</h4>
                    <p className="text-[10px] text-stone-500 font-bold uppercase tracking-widest leading-relaxed">
                      Aguardando conferência do<br/>setor financeiro (24h úteis)
                    </p>
                  </div>
                  {academyReceipts.length > 0 && (
                     <button 
                       onClick={() => onViewReceipt(academyReceipts[0].receiptData)}
                       className="text-[10px] font-black text-blue-500 uppercase tracking-widest hover:underline"
                     >
                       Ver comprovante enviado
                     </button>
                   )}
                </div>
              )}
            </div>
          </Card>
        );
      })}

      {isAdding ? (
        <Card className="p-8 max-w-2xl mx-auto border-white/5">
          <form onSubmit={handleSubmit} className="space-y-8">
            <h3 className="text-xl font-black text-white italic uppercase tracking-tighter border-b border-white/5 pb-4">Nova Inscrição</h3>
            <Select 
              label="Competidor" 
              options={athletes.map(a => ({ value: a.id, label: a.name }))} 
              value={formData.athleteId}
              onChange={e => setFormData({ ...formData, athleteId: e.target.value })}
              required
            />
            
            <div className="space-y-4">
              <label className="text-[10px] font-black text-stone-500 uppercase tracking-widest ml-1">Disciplinas</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {(['Kyorugui', 'Poomsae', 'Kyopa (3 tábuas)', 'Kyopa (5 tábuas)'] as const).map(cat => (
                  <label key={cat} className={cn(
                    "flex items-center gap-4 p-5 rounded-2xl border transition-all cursor-pointer relative overflow-hidden group",
                    formData.categories.includes(cat) 
                      ? "bg-red-600 text-white border-red-500 shadow-xl" 
                      : "bg-white/5 border-white/5 text-stone-400 hover:border-white/10 hover:bg-white/[0.08]"
                  )}>
                    <input 
                      type="checkbox" 
                      className="hidden"
                      checked={formData.categories.includes(cat)}
                      onChange={() => toggleCategory(cat)}
                    />
                    <div className={cn(
                      "w-5 h-5 rounded-lg border flex items-center justify-center transition-colors",
                      formData.categories.includes(cat) ? "bg-white text-red-600 border-white" : "border-white/10"
                    )}>
                      {formData.categories.includes(cat) && <CheckCircle2 className="w-3 h-3" />}
                    </div>
                    <span className="font-black uppercase tracking-tight text-sm">{cat}</span>
                    {formData.categories.includes(cat) && (
                      <div className="absolute right-0 top-0 h-full w-1.5 bg-white/20" />
                    )}
                  </label>
                ))}
              </div>
            </div>

            {currentPrice > 0 && (
              <div className="bg-stone-900/60 p-8 rounded-3xl border border-white/5 space-y-6 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-red-600/5 rounded-full blur-3xl -mr-16 -mt-16" />
                <div className="flex justify-between items-center border-b border-white/5 pb-6">
                  <span className="text-[10px] font-black text-stone-500 uppercase tracking-widest">Investimento</span>
                  <span className="text-4xl font-black text-white tracking-tighter">R$ {currentPrice.toFixed(2).replace('.', ',')}</span>
                </div>
                
                <div className="flex flex-col sm:flex-row gap-8 items-center">
                  <div className="bg-white p-2 rounded-2xl shadow-2xl shrink-0">
                    <QRCodeSVG 
                      value={generatePix(
                        currentPrice, 
                        `Insc: ${athletes.find(a => a.id === formData.athleteId)?.name.substring(0, 15)}`, 
                        "NOVO"
                      )} 
                      size={100} 
                    />
                  </div>
                  <div className="space-y-4 flex-1">
                    <p className="text-[10px] font-black text-stone-500 uppercase tracking-widest">Pagamento Via PIX</p>
                    <div className="flex gap-2">
                      <input 
                        type="text" 
                        readOnly 
                        value={generatePix(
                          currentPrice, 
                          `Insc: ${athletes.find(a => a.id === formData.athleteId)?.name.substring(0, 15)}`, 
                          "NOVO"
                        )} 
                        className="w-full text-[10px] font-mono px-4 py-2.5 bg-black/40 border border-white/5 rounded-xl text-stone-400 outline-none" 
                      />
                      <Button 
                        type="button" 
                        variant="ghost" 
                        className="px-4 py-2 text-[10px] font-black uppercase tracking-widest bg-white/5 hover:bg-white/10"
                        onClick={() => {
                          navigator.clipboard.writeText(generatePix(
                            currentPrice, 
                            `Insc: ${athletes.find(a => a.id === formData.athleteId)?.name.substring(0, 15)}`, 
                            "NOVO"
                          ));
                          alert('PIX Copiado!');
                        }}
                      >
                        Copiar
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-4 pt-4">
              <Button type="submit" className="flex-1 py-4 text-sm shadow-red-600/20">Finalizar Inscrição</Button>
              <Button type="button" variant="secondary" className="flex-1 py-4 text-sm" onClick={() => {
                setIsAdding(false);
                setFormData({ athleteId: '', categories: [] });
              }}>Cancelar</Button>
            </div>
          </form>
        </Card>
      ) : (
        <Card className="border-white/5 bg-white/[0.02]">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[800px]">
              <thead>
                <tr className="bg-white/5 border-b border-white/5">
                  <th className="px-8 py-5 text-[10px] font-black text-stone-500 uppercase tracking-[0.2em]">Competidor</th>
                  <th className="px-8 py-5 text-[10px] font-black text-stone-500 uppercase tracking-[0.2em]">Categorias</th>
                  <th className="px-8 py-5 text-[10px] font-black text-stone-500 uppercase tracking-[0.2em]">Pagamento</th>
                  <th className="px-8 py-5 text-[10px] font-black text-stone-500 uppercase tracking-[0.2em]">Data</th>
                  <th className="px-8 py-5 text-[10px] font-black text-stone-500 uppercase tracking-[0.2em] text-center">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {myAcademyRegs.map(reg => {
                  const athlete = athletes.find(a => a.id === reg.athleteId);
                  return (
                    <tr key={reg.id} className="hover:bg-white/[0.03] transition-colors group/row">
                      <td className="px-8 py-6">
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center border border-white/5">
                             <span className="text-sm font-black text-white">{athlete?.name.charAt(0)}</span>
                          </div>
                          <div>
                            <p className="font-black text-white uppercase tracking-tight leading-none">{athlete?.name}</p>
                            <p className="text-[10px] text-stone-500 font-bold uppercase tracking-widest mt-1.5 italic">
                              {academies.find(a => a.id === reg.academyId)?.name}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-8 py-6">
                        <div className="flex flex-wrap gap-2">
                          {reg.categories.map(cat => (
                            <span key={cat} className="px-2 py-0.5 bg-white/5 border border-white/10 rounded-md text-[9px] font-black text-stone-300 uppercase tracking-widest whitespace-nowrap">
                              {cat}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-8 py-6">
                         <div className={cn(
                          "inline-flex items-center gap-2 px-3 py-1 rounded-full border text-[10px] font-black uppercase tracking-widest",
                          reg.paymentStatus === 'Pago' ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" :
                          reg.paymentStatus === 'Em Análise' ? "bg-blue-500/10 text-blue-500 border-blue-500/20" :
                          "bg-amber-500/10 text-amber-500 border-amber-500/20"
                        )}>
                          {reg.paymentStatus === 'Pago' ? <CheckCircle2 className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                          {reg.paymentStatus}
                        </div>
                      </td>
                      <td className="px-8 py-6">
                        <p className="text-[10px] text-stone-500 font-bold uppercase tracking-widest">
                          {new Date(reg.createdAt).toLocaleDateString('pt-BR')}
                        </p>
                      </td>
                      <td className="px-8 py-6">
                        <div className="flex justify-center gap-2">
                          <Button 
                            variant="ghost" 
                            className="p-3 bg-white/5 hover:bg-emerald-600/20 group/wa" 
                            onClick={() => {
                              const text = `Olá! A inscrição do atleta *${athlete?.name}* no 3º Festival União Lopes está *${reg.paymentStatus}*. 🥋\n\n*Categorias:* ${reg.categories.join(', ')}`;
                              const academy = academies.find(a => a.id === reg.academyId);
                              let url = `https://wa.me/?text=${encodeURIComponent(text)}`;
                              if (profile?.role === 'admin' && academy?.contact) {
                                url = `https://wa.me/${formatWhatsAppNumber(academy.contact)}?text=${encodeURIComponent(text)}`;
                              }
                              window.open(url, '_blank');
                            }}
                          >
                            <span className="text-[10px] font-black text-emerald-500 uppercase tracking-widest px-1">WA</span>
                          </Button>
                          {profile?.role === 'admin' && (
                            <Button 
                              variant="ghost" 
                              className="p-3 bg-white/5 hover:bg-emerald-600/20 group/approve" 
                              onClick={() => handlePaymentStatus(reg.id, reg.paymentStatus)}
                            >
                              <CheckCircle2 className="w-4 h-4 group-hover/approve:text-emerald-500 transition-colors" />
                            </Button>
                          )}
                          {(profile?.role === 'admin' || reg.paymentStatus === 'Pendente') && (
                            <Button variant="ghost" className="p-3 bg-white/5 hover:bg-red-600/20 group/del" onClick={() => handleDeleteRegistration(reg.id)}>
                              <Trash2 className="w-4 h-4 group-hover/del:text-red-500 transition-colors" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {myAcademyRegs.length === 0 && (
            <div className="py-24 text-center">
              <p className="text-[10px] text-stone-600 uppercase font-black tracking-[0.2em]">Sem inscrições realizadas</p>
            </div>
          )}
        </Card>
      )}
      {/* Hidden Global Input for Receipts */}
      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleReceiptUpload} 
        accept="image/*,application/pdf" 
        className="hidden" 
      />
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
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-10 max-w-4xl mx-auto">
      <header>
        <h2 className="text-3xl font-black text-white italic uppercase tracking-tighter">Meu Perfil</h2>
        <p className="text-[10px] text-stone-500 font-bold uppercase tracking-widest mt-1">Gerenciamento de conta e identidade</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <Card className="md:col-span-1 p-8 border-white/5 bg-white/[0.02] flex flex-col items-center text-center">
          <div className="relative group/avatar">
            <div className="absolute inset-0 bg-red-600/20 rounded-full blur-2xl opacity-0 group-hover/avatar:opacity-100 transition-opacity" />
            <img 
              src={profile?.photoURL || user.photoURL || ''} 
              alt="Avatar" 
              className="w-40 h-40 rounded-full border-4 border-white/10 shadow-2xl object-cover bg-stone-900 relative z-10"
            />
            <button 
              onClick={() => fileInputRef.current?.click()}
              className="absolute bottom-2 right-2 p-4 bg-red-600 text-white rounded-2xl shadow-xl hover:bg-red-700 transition-all z-20 group-hover/avatar:scale-110"
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
          
          <div className="mt-8 space-y-2">
            <h3 className="text-2xl font-black text-white uppercase tracking-tighter italic">{profile?.displayName || user.displayName}</h3>
            <p className="text-[10px] font-black text-red-500 uppercase tracking-[0.2em]">{profile?.role}</p>
          </div>
        </Card>

        <Card className="md:col-span-2 p-10 border-white/5 bg-white/[0.02] space-y-10">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-10">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-stone-500 uppercase tracking-widest ml-1">E-mail de Acesso</label>
              <div className="p-4 bg-black/40 border border-white/5 rounded-2xl text-white font-bold tracking-tight">
                {profile?.email}
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-stone-500 uppercase tracking-widest ml-1">UID do Sistema</label>
              <div className="p-4 bg-black/40 border border-white/5 rounded-2xl text-stone-500 font-mono text-[10px] truncate">
                {profile?.uid}
              </div>
            </div>
            <div className="space-y-2">
              <Input 
                label="Data de Nascimento" 
                type="date" 
                value={profile?.birthDate || ''} 
                onChange={async (e) => {
                  try {
                    await updateDoc(doc(db, 'users', profile!.uid), { birthDate: e.target.value });
                  } catch (err) {
                    alert('Erro ao atualizar data de nascimento.');
                  }
                }} 
              />
            </div>
            <div className="space-y-2">
              <Select 
                label="Gênero" 
                options={[
                  { value: 'M', label: 'Masculino' }, 
                  { value: 'F', label: 'Feminino' }
                ]} 
                value={profile?.gender || 'M'}
                onChange={async (e) => {
                  try {
                    await updateDoc(doc(db, 'users', profile!.uid), { gender: e.target.value });
                  } catch (err) {
                    alert('Erro ao atualizar gênero.');
                  }
                }}
              />
            </div>
          </div>

          <div className="pt-6 border-t border-white/5">
             <h4 className="text-[10px] font-black text-stone-500 uppercase tracking-widest mb-6 ml-1">Sincronização de Foto</h4>
             <div className="flex flex-col sm:flex-row gap-4">
              <Button 
                variant="primary" 
                className="flex-1 py-4"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
              >
                {isUploading ? 'Processando...' : 'Carregar Nova Imagem'}
              </Button>
              {user.photoURL && (
                <Button 
                  variant="secondary" 
                  className="flex-1 py-4"
                  onClick={handleUseGooglePhoto}
                >
                  Vincular Foto do Google
                </Button>
              )}
            </div>
            <p className="text-[9px] text-stone-600 font-bold uppercase tracking-widest mt-6 text-center italic">
              Imagens recomendadas em formato quadrado (máx 800KB)
            </p>
          </div>
        </Card>
      </div>
    </motion.div>
  );
}

function CompetitionView({ registrations, athletes, academies, user }: { registrations: Registration[]; athletes: Athlete[]; academies: Academy[]; user: User }) {
  const [selectedCategory, setSelectedCategory] = useState<string>('Kyorugui');
  
  const groupedAthletes = useMemo(() => {
    const groups: Record<string, any[]> = {};
    
    registrations.filter(r => r.status === 'Confirmado').forEach(reg => {
      const athlete = athletes.find(a => a.id === reg.athleteId);
      if (!athlete) return;
      
      const isKyopaTab = selectedCategory === 'Kyopa';
      const hasKyopa = reg.categories.some(c => c.includes('Kyopa'));
      const hasCategory = reg.categories.includes(selectedCategory as any);

      if (isKyopaTab) {
        if (!hasKyopa) return;
      } else {
        if (!hasCategory) return;
      }
      
      const ageCat = getAgeCategory(athlete.birthDate, athlete.belt);
      const weightCat = getWeightCategory(ageCat, athlete.gender, athlete.weight, athlete.belt);
      const isDan = athlete.belt.includes('Dan') ? 'Preta' : 'Colorida';
      const genderStr = athlete.gender === 'M' ? 'Masculino' : 'Feminino';
      
      let groupKey = '';
      if (isKyopaTab) {
        groupKey = `KYOPA (Geral)`;
      } else if (selectedCategory === 'Kyorugui') {
        groupKey = `${ageCat} | ${isDan} | ${genderStr} | ${weightCat}`;
      } else {
        groupKey = `${ageCat} | ${isDan} | ${genderStr}`;
      }
      
      if (!groups[groupKey]) groups[groupKey] = [];
      groups[groupKey].push({
        ...athlete,
        academy: academies.find(a => a.id === athlete.academyId)?.name || 'Desconhecida'
      });
    });
    
    return groups;
  }, [registrations, athletes, academies, selectedCategory]);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-10">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
        <div>
          <h2 className="text-3xl font-black text-white italic uppercase tracking-tighter">Chaves de Luta</h2>
          <p className="text-[10px] text-stone-500 font-bold uppercase tracking-widest mt-1">Visualização por categorias confirmadas</p>
        </div>
        <div className="flex bg-white/5 p-1 rounded-2xl border border-white/5 overflow-x-auto">
          {['Kyorugui', 'Poomsae', 'Kyopa'].map(cat => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={cn(
                "px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                selectedCategory === cat 
                  ? "bg-red-600 text-white shadow-lg" 
                  : "text-stone-500 hover:text-white"
              )}
            >
              {cat}
            </button>
          ))}
        </div>
      </header>

      {Object.keys(groupedAthletes).length === 0 ? (
        <Card className="py-32 text-center border-white/5 bg-white/[0.02]">
          <div className="w-20 h-20 bg-white/5 rounded-3xl flex items-center justify-center mx-auto mb-6 border border-white/5 group">
            <Trophy className="w-10 h-10 text-stone-700 group-hover:text-red-600 group-hover:scale-110 transition-all" />
          </div>
          <p className="text-[10px] text-stone-600 font-black uppercase tracking-[0.2em]">Nenhum atleta confirmado nesta categoria</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {Object.entries(groupedAthletes).map(([key, groupAthletes]) => (
            <Card key={key} className="p-0 border-white/5 bg-gradient-to-br from-white/[0.03] to-transparent overflow-hidden">
              <div className="bg-white/5 px-8 py-4 border-b border-white/5 flex justify-between items-center">
                <span className="text-[10px] font-black text-red-500 uppercase tracking-widest">{key}</span>
                <span className="px-2 py-0.5 bg-red-600 rounded text-[9px] font-black text-white uppercase">{groupAthletes.length} Atletas</span>
              </div>
              <div className="p-8 space-y-4">
                {groupAthletes.map((athlete, idx) => (
                  <div key={athlete.id} className="flex justify-between items-center group/item">
                    <div className="flex items-center gap-4">
                      <div className="w-8 h-8 rounded-lg bg-stone-900 border border-white/5 flex items-center justify-center text-[10px] font-black text-white">
                        {idx + 1}
                      </div>
                      <div>
                        <p className="font-black text-white uppercase tracking-tight text-sm">{athlete.name}</p>
                        <p className="text-[9px] text-stone-500 font-bold uppercase tracking-widest mt-1 italic">{athlete.academy}</p>
                      </div>
                    </div>
                    <div className="text-right">
                       <BeltBadge belt={athlete.belt} size="sm" />
                       <p className="text-[9px] font-black text-stone-600 uppercase tracking-widest mt-1.5">{athlete.weight}kg</p>
                    </div>
                  </div>
                ))}
              </div>
              {groupAthletes.length === 1 && (
                <div className="m-8 mt-0 p-4 bg-amber-600/10 border border-amber-600/20 rounded-2xl flex items-center gap-3">
                  <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
                  <p className="text-[9px] font-black text-amber-500 uppercase tracking-widest leading-relaxed">
                    Atleta único na chave. Necessário remanejamento técnico.
                  </p>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </motion.div>
  );
}

function AdminView({ profile, user, registrations, athletes, academies, receipts, settings, onViewReceipt, key }: { profile: UserProfile | null; user: User | null; registrations: Registration[]; athletes: Athlete[]; academies: Academy[]; receipts: any[]; settings: any; onViewReceipt: (data: string) => void; key?: string }) {
  const [adminTab, setAdminTab] = useState<'finance' | 'competition'>('finance');

  const calculatePrice = (categories: string[]) => {
    let total = 0;
    if (categories.includes('Kyorugui') || categories.includes('Poomsae')) {
      total += 90;
    }
    if (categories.includes('Kyopa (3 tábuas)')) {
      total += 25;
    }
    if (categories.includes('Kyopa (5 tábuas)')) {
      total += 35;
    }
    return total;
  };

  const academyStats = useMemo(() => academies.map(academy => {
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
  }).filter(a => a.totalRegs > 0), [academies, registrations, settings]);

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

      const academyReceipts = receipts.filter(r => r.academyId === academyId);
      await Promise.all(academyReceipts.map(receipt => 
        deleteDoc(doc(db, 'receipts', receipt.id))
      ));

      alert('Pagamentos aprovados com sucesso!');
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
      alert('Comprovante rejeitado.');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'receipts');
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-10">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
        <div>
          <h2 className="text-3xl font-black text-white italic uppercase tracking-tighter">Administração</h2>
          <p className="text-[10px] text-stone-500 font-bold uppercase tracking-widest mt-1">Gestão financeira e operacional do evento</p>
        </div>
        <div className="flex bg-white/5 p-1 rounded-2xl border border-white/5">
          <button 
            onClick={() => setAdminTab('finance')}
            className={cn("px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all", adminTab === 'finance' ? "bg-red-600 text-white shadow-lg" : "text-stone-500 hover:text-white")}
          >
            Financeiro
          </button>
          <button 
            onClick={() => setAdminTab('competition')}
            className={cn("px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all", adminTab === 'competition' ? "bg-red-600 text-white shadow-lg" : "text-stone-500 hover:text-white")}
          >
            Compromisso
          </button>
        </div>
      </header>

      {adminTab === 'finance' ? (
        <div className="space-y-10">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card className="p-8 border-white/5 bg-gradient-to-br from-emerald-600/10 to-transparent">
              <p className="text-[10px] font-black text-emerald-500 uppercase tracking-widest mb-2">Total Arrecadado</p>
              <p className="text-4xl font-black text-white tracking-tighter italic">R$ {academyStats.reduce((sum, a) => sum + a.paidValue, 0).toFixed(2).replace('.', ',')}</p>
            </Card>
            <Card className="p-8 border-white/5 bg-gradient-to-br from-amber-600/10 to-transparent">
              <p className="text-[10px] font-black text-amber-500 uppercase tracking-widest mb-2">Total Pendente</p>
              <p className="text-4xl font-black text-white tracking-tighter italic">R$ {academyStats.reduce((sum, a) => sum + a.pendingValue, 0).toFixed(2).replace('.', ',')}</p>
            </Card>
            <Card className="p-8 border-white/5 bg-white/[0.02]">
              <p className="text-[10px] font-black text-stone-500 uppercase tracking-widest mb-2">Inscrições Totais</p>
              <p className="text-4xl font-black text-white tracking-tighter italic">{registrations.length}</p>
            </Card>
          </div>

          <Card className="border-white/5 bg-white/[0.02] p-8 flex flex-col md:flex-row justify-between items-center gap-6">
            <div className="flex items-center gap-5">
              <div className="p-4 bg-blue-600/10 rounded-2xl border border-blue-500/20">
                <CreditCard className="w-8 h-8 text-blue-500" />
              </div>
              <div>
                <h4 className="text-xl font-black text-white uppercase tracking-tighter italic">Mercado Pago</h4>
                <p className="text-[10px] text-stone-500 font-bold uppercase tracking-widest mt-1">Botão de pagamento para academias</p>
              </div>
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
              className={cn(
                "w-16 h-8 rounded-full transition-all relative p-1",
                settings.mercadoPagoEnabled ? 'bg-red-600' : 'bg-stone-800'
              )}
            >
              <div className={cn(
                "w-6 h-6 rounded-full bg-white transition-all shadow-lg",
                settings.mercadoPagoEnabled ? 'ml-8' : 'ml-0'
              )} />
            </button>
          </Card>

          <Card className="border-white/5 bg-white/[0.02] overflow-hidden">
            <div className="p-8 border-b border-white/5 bg-white/5">
              <h3 className="text-xl font-black text-white italic uppercase tracking-tighter">Resumo por Academia</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[1000px]">
                <thead>
                  <tr className="bg-white/5 border-b border-white/5">
                    <th className="px-8 py-5 text-[10px] font-black text-stone-500 uppercase tracking-[0.2em]">Academia</th>
                    <th className="px-8 py-5 text-[10px] font-black text-stone-500 uppercase tracking-[0.2em]">Responsável</th>
                    <th className="px-8 py-5 text-[10px] font-black text-stone-500 uppercase tracking-[0.2em]">Atletas</th>
                    <th className="px-8 py-5 text-[10px] font-black text-stone-500 uppercase tracking-[0.2em]">Pendente</th>
                    <th className="px-8 py-5 text-[10px] font-black text-stone-500 uppercase tracking-[0.2em]">Pago</th>
                    <th className="px-8 py-5 text-[10px] font-black text-stone-500 uppercase tracking-[0.2em] text-center">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {academyStats.map(stat => {
                    const academyReceipts = receipts.filter(r => r.academyId === stat.id);
                    return (
                      <tr key={stat.id} className="hover:bg-white/[0.03] transition-colors group/row">
                        <td className="px-8 py-6">
                           <p className="font-black text-white uppercase tracking-tight">{stat.name}</p>
                           <p className="text-[9px] text-stone-500 font-bold uppercase tracking-widest mt-1 italic">{stat.contact}</p>
                        </td>
                        <td className="px-8 py-6">
                           <p className="text-xs font-bold text-stone-300 uppercase tracking-tight">{stat.coach}</p>
                        </td>
                        <td className="px-8 py-6">
                           <span className="px-2.5 py-1 bg-white/5 border border-white/10 rounded-lg text-[10px] font-black text-white">
                             {stat.totalRegs}
                           </span>
                        </td>
                        <td className="px-8 py-6 text-amber-500 font-black tabular-nums tracking-tighter">
                           R$ {stat.pendingValue.toFixed(2).replace('.', ',')}
                        </td>
                        <td className="px-8 py-6 text-emerald-500 font-black tabular-nums tracking-tighter">
                           R$ {stat.paidValue.toFixed(2).replace('.', ',')}
                        </td>
                        <td className="px-8 py-6">
                          <div className="flex justify-center gap-3">
                             {academyReceipts.length > 0 && (
                               <div className="flex gap-2">
                                 <Button 
                                   variant="ghost" 
                                   className="p-3 bg-blue-600/10 hover:bg-blue-600/20 text-blue-500 rounded-xl"
                                   onClick={() => onViewReceipt(academyReceipts[0].receiptData)}
                                 >
                                    <FileText className="w-4 h-4" />
                                 </Button>
                                 <Button 
                                   variant="ghost" 
                                   className="p-3 bg-red-600/10 hover:bg-red-600/20 text-red-500 rounded-xl"
                                   onClick={() => handleRejectReceipt(academyReceipts[0].id, stat.id)}
                                 >
                                    <Trash2 className="w-4 h-4" />
                                 </Button>
                               </div>
                             )}
                             {stat.pendingValue > 0 && (
                               <Button 
                                 variant="success" 
                                 className="px-6 py-2.5 text-[10px] font-black uppercase tracking-widest shadow-emerald-600/20"
                                 onClick={() => handleApproveAll(stat.id)}
                               >
                                 Liberar Lote
                               </Button>
                             )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      ) : (
        <CompetitionView registrations={registrations} athletes={athletes} academies={academies} user={user!} />
      )}
    </motion.div>
  );
}
