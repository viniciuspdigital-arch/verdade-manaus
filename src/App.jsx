import React, { useState, useEffect, useRef } from 'react';
import { Search, Share2, MessageCircle, Menu, X, Filter, TrendingUp, Shield, CheckCircle, AlertTriangle, FileText, Upload, Zap, Settings, RefreshCw, ExternalLink, ChevronDown, Globe } from 'lucide-react';
import html2canvas from 'html2canvas';
import logoOndaDigital from './assets/logo-onda-digital.png';
import { Link } from 'lucide-react';

// Configuração das APIs
const PERPLEXITY_API_URL = "https://api.perplexity.ai/chat/completions";
const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";
const OPENAI_AUDIO_URL = "https://api.openai.com/v1/audio/transcriptions";

// Mapeamento de chaves via Variáveis de Ambiente (Vite)
const ENV_OPENAI_KEY = import.meta.env.VITE_OPENAI_API_KEY;
const ENV_PERPLEXITY_KEY = import.meta.env.VITE_PERPLEXITY_API_KEY;

const fetchWithRetry = async (url, options, retries = 3) => {
    for (let i = 0; i < retries; i++) {
        try {
            const response = await fetch(url, options);
            if (response.status === 429 && i < retries - 1) {
                const delay = Math.pow(2, i) * 1000 + Math.random() * 1000;
                await new Promise(resolve => setTimeout(resolve, delay));
                continue;
            }
            return response;
        } catch (error) {
            if (i < retries - 1) continue;
            throw error;
        }
    }
};

export default function App() {
    const [query, setQuery] = useState('');
    const [status, setStatus] = useState('idle'); // idle, searching_google, analyzing_openai, done, error
    const [result, setResult] = useState(null);
    const [sources, setSources] = useState([]);
    const [activeTab, setActiveTab] = useState('home');
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

    // Estados para as chaves
    const [openAIKey, setOpenAIKey] = useState(ENV_OPENAI_KEY || '');
    const [perplexityKey, setPerplexityKey] = useState(ENV_PERPLEXITY_KEY || '');
    const [showSettingsModal, setShowSettingsModal] = useState(false);

    // Estados novos (Phase 2)
    const [trendingNews, setTrendingNews] = useState([]);
    const [isLoadingNews, setIsLoadingNews] = useState(false);
    const [newsPage, setNewsPage] = useState(1);
    const [hasMoreNews, setHasMoreNews] = useState(true);
    const [isTranscribing, setIsTranscribing] = useState(false);
    const [selectedTopic, setSelectedTopic] = useState('Geral');
    const [showCandidatesModal, setShowCandidatesModal] = useState(false);
    const [isDragging, setIsDragging] = useState(false); // Drag and Drop State

    // Favorites Logic
    const [userTopics, setUserTopics] = useState([]); // List of user-added favorites
    const [tempSelectedTopics, setTempSelectedTopics] = useState([]); // Temporary selection in modal

    const cardRef = useRef(null);

    const mainTopics = ["Geral", "David Almeida", "Amom Mandel", "Wilson Lima", "Alberto Neto", "Roberto Cidade"];
    const moreTopics = ["Marcelo Ramos", "Eduardo Braga", "Plínio Valério", "Arthur Virgílio", "Omar Aziz", "Alessandra Campelo", "Wilker Barreto", "Joana Darc"];
    const allTopics = [...new Set([...mainTopics, ...moreTopics])]; // Combined unique list

    // Combine fixed + user favorites for the main bar
    const displayTopics = [...mainTopics, ...userTopics];

    // === PERSONALIZED FEED: Interest Tracking ===
    const INTERESTS_KEY = 'verdade_interests';

    // Load interests from localStorage on mount
    const [userInterests, setUserInterests] = useState(() => {
        try {
            const stored = localStorage.getItem(INTERESTS_KEY);
            return stored ? JSON.parse(stored) : {};
        } catch { return {}; }
    });

    // Save interests to localStorage whenever they change
    useEffect(() => {
        localStorage.setItem(INTERESTS_KEY, JSON.stringify(userInterests));
    }, [userInterests]);

    // Track interest (called on topic click or search)
    const trackInterest = (topic) => {
        if (!topic || topic === 'Geral') return;
        setUserInterests(prev => ({
            ...prev,
            [topic]: (prev[topic] || 0) + 1
        }));
    };

    // Get top interests for personalization
    const getTopInterests = (count = 2) => {
        return Object.entries(userInterests)
            .sort(([, a], [, b]) => b - a)
            .slice(0, count)
            .map(([topic]) => topic);
    };

    // Inicializar Trending News
    useEffect(() => {
        if (activeTab === 'home') {
            // Reset e busca inicial
            setTrendingNews([]);
            setNewsPage(1);
            setHasMoreNews(true);

            // Personalized: If user has interests and is on 'Geral', mix in personalized news
            const topInterests = getTopInterests(2);
            if (selectedTopic === 'Geral' && topInterests.length > 0) {
                // Fetch general news + personalized news silently
                fetchTrendingNews('Geral', 1, topInterests);
            } else {
                fetchTrendingNews(selectedTopic, 1);
            }
        }
    }, [activeTab, selectedTopic]); // Reloads on tab or topic change

    // Infinite Scroll / Load More Logic
    // Reverted to Manual Button as per user request
    const handleLoadMore = () => {
        const nextPage = newsPage + 1;
        setNewsPage(nextPage);
        fetchTrendingNews(selectedTopic, nextPage);
    };

    const fetchTrendingNews = async (topic = 'Geral', page = 1, personalizedTopics = []) => {
        setIsLoadingNews(true);
        try {
            // API Direta: https://painel.redeondadigital.com.br/wp-json/wp/v2/posts?categories=11
            let url = `https://painel.redeondadigital.com.br/wp-json/wp/v2/posts?categories=11&per_page=6&page=${page}&_fields=id,date,link,title,excerpt,slug`;

            if (topic !== 'Geral') {
                url += `&search=${encodeURIComponent(topic)}`;
            }

            const response = await fetch(url);
            if (!response.ok) {
                if (response.status === 400) {
                    setHasMoreNews(false); // End of pagination usually returns 400 in WP
                    return;
                }
                throw new Error("Falha ao buscar");
            }
            const data = await response.json();

            if (data.length === 0) {
                setHasMoreNews(false);
                return;
            }

            let formattedNews = data.map(post => ({
                headline: post.title.rendered,
                // Remove HTML tags from excerpt
                description: post.excerpt.rendered.replace(/<[^>]*>?/gm, '').replace('[&hellip;]', '...'),
                date: new Date(post.date).toLocaleDateString('pt-BR'),
                // Construir URL limpa: https://redeondadigital.com.br + /politica/ + slug
                url: `https://redeondadigital.com.br/politica/${post.slug}`
            }));

            // === PERSONALIZED FEED: Mix in personalized news on first page ===
            if (page === 1 && personalizedTopics.length > 0) {
                for (const pTopic of personalizedTopics) {
                    try {
                        const pUrl = `https://painel.redeondadigital.com.br/wp-json/wp/v2/posts?categories=11&per_page=2&page=1&_fields=id,date,link,title,excerpt,slug&search=${encodeURIComponent(pTopic)}`;
                        const pResponse = await fetch(pUrl);
                        if (pResponse.ok) {
                            const pData = await pResponse.json();
                            const pNews = pData.map(post => ({
                                headline: post.title.rendered,
                                description: post.excerpt.rendered.replace(/<[^>]*>?/gm, '').replace('[&hellip;]', '...'),
                                date: new Date(post.date).toLocaleDateString('pt-BR'),
                                url: `https://redeondadigital.com.br/politica/${post.slug}`,
                                _personalized: true // Internal flag, not shown to user
                            }));
                            // Insert personalized news at strategic positions (2nd, 4th)
                            formattedNews = [...formattedNews.slice(0, 1), ...pNews.slice(0, 1), ...formattedNews.slice(1, 3), ...pNews.slice(1, 2), ...formattedNews.slice(3)];
                        }
                    } catch (e) {
                        console.log('Personalized fetch failed silently:', e);
                    }
                }
                // Remove duplicates by URL
                const seen = new Set();
                formattedNews = formattedNews.filter(item => {
                    if (seen.has(item.url)) return false;
                    seen.add(item.url);
                    return true;
                });
            }

            setTrendingNews(prev => page === 1 ? formattedNews : [...prev, ...formattedNews]);
        } catch (error) {
            console.error("Erro ao buscar notícias:", error);
            // Fallback silencioso ou estado de erro visual se desejar
        } finally {
            setIsLoadingNews(false);
        }
    };

    const handleDragOver = (e) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = (e) => {
        e.preventDefault();
        setIsDragging(false);
    };

    const handleDrop = async (e) => {
        e.preventDefault();
        setIsDragging(false);
        const file = e.dataTransfer.files[0];
        if (file) {
            handleFileUpload(file);
        }
    };

    const handleFileUpload = async (fileOrEvent) => {
        // Suporta tanto Evento (Input) quanto File (DragDrop)
        const file = fileOrEvent.target ? fileOrEvent.target.files[0] : fileOrEvent;

        if (!file || !openAIKey) {
            if (!openAIKey) {
                alert("Para usar upload de arquivos, você precisa de uma chave OpenAI configurada.");
                setShowSettingsModal(true);
            }
            return;
        }

        setIsTranscribing(true);
        try {
            let transcription = "";

            if (file.type.startsWith('audio/')) {
                // OpenAI Whisper API for Audio
                const formData = new FormData();
                formData.append("file", file);
                formData.append("model", "whisper-1");

                const response = await fetch(OPENAI_AUDIO_URL, {
                    method: "POST",
                    headers: {
                        "Authorization": `Bearer ${openAIKey}`
                    },
                    body: formData
                });
                if (!response.ok) throw new Error("Erro na transcrição de áudio (Whisper).");
                const data = await response.json();
                transcription = data.text;

            } else if (file.type.startsWith('image/')) {
                // GPT-4o Vision for Images
                const reader = new FileReader();
                reader.readAsDataURL(file);
                reader.onloadend = async () => {
                    const base64Data = reader.result; // Data URL including mime type

                    const payload = {
                        model: "gpt-4o",
                        messages: [
                            {
                                role: "user",
                                content: [
                                    { type: "text", text: "Descreva detalhadamente o que é mostrado nesta imagem para fins de verificação de fatos. Transcreva qualquer texto visível." },
                                    { type: "image_url", image_url: { url: base64Data } }
                                ]
                            }
                        ]
                    };

                    try {
                        const response = await fetch(OPENAI_API_URL, {
                            method: "POST",
                            headers: {
                                "Content-Type": "application/json",
                                "Authorization": `Bearer ${openAIKey}`
                            },
                            body: JSON.stringify(payload)
                        });

                        const data = await response.json();
                        transcription = data.choices?.[0]?.message?.content;

                        finishUpload(transcription, file.type);
                    } catch (err) {
                        console.error(err);
                        setIsTranscribing(false);
                        alert("Erro ao processar imagem.");
                    }
                };
                return; // Wait for onloadend logic
            } else {
                alert("Formato de arquivo não suportado. Use imagens ou áudio.");
                setIsTranscribing(false);
                return;
            }

            if (file.type.startsWith('audio/')) {
                finishUpload(transcription, file.type);
            }

        } catch (e) {
            console.error(e);
            setIsTranscribing(false);
            alert("Erro ao processar arquivo. Verifique sua chave OpenAI.");
        }
    };

    const finishUpload = (text, type) => {
        if (text) {
            const finalQuery = `[Conteúdo do Arquivo (${type})]: ${text}`;
            setQuery(finalQuery); // Atualiza UI
            setActiveTab('verify');
            // AUTO-TRIGGER: Dispara a busca imediatamente
            handleSearch(null, finalQuery);
        }
        setIsTranscribing(false);
    };

    const generateCard = async () => {
        if (cardRef.current) {
            try {
                const canvas = await html2canvas(cardRef.current, { scale: 2, backgroundColor: '#ffffff' });
                const image = canvas.toDataURL("image/png");
                const link = document.createElement("a");
                link.href = image;
                link.download = `VerdadeManaus-Check-${Date.now()}.png`;
                link.click();
            } catch (e) {
                console.error("Erro ao gerar card:", e);
            }
        }
    };

    const handleSearch = async (e, manualQuery = null) => {
        if (e) e.preventDefault();

        // Use manualQuery if provided, otherwise state query
        const textToSearch = manualQuery || query;
        if (!textToSearch) return;

        if (!openAIKey || !perplexityKey) {
            setShowSettingsModal(true);
            return;
        }

        // Se foi chamado manualmente (upload), garante que o estado query esteja sincronizado
        if (manualQuery) setQuery(manualQuery);



        setStatus('searching_google');
        setResult(null);
        setSources([]);

        try {
            // --- PASSO 1: PERPLEXITY (Busca/Grounding) ---
            // Modelo sonar-pro ou sonar para busca
            const searchPrompt = `Faça uma varredura completa na web sobre: "${textToSearch}".
            1. Busque primeiro no "redeondadigital.com.br" para ver se há confirmação oficial.
            2. Busque em agências de checagem (Lupa, Aos Fatos, Boatos.org) se for um rumor viral.
            3. Identifique se é um boato, sátira ou notícia verdadeira fora de contexto.`;

            const perplexityPayload = {
                model: "sonar-pro", // ou "sonar"
                messages: [
                    { role: "system", content: "Você é um assistente de busca preciso. Retorne respostas baseadas em fontes reais." },
                    { role: "user", content: searchPrompt }
                ],
                temperature: 0.1
            };

            const perplexityResponse = await fetchWithRetry(PERPLEXITY_API_URL, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${perplexityKey}`
                },
                body: JSON.stringify(perplexityPayload)
            });

            if (!perplexityResponse.ok) {
                // Tenta ler o erro
                let errMsg = perplexityResponse.statusText;
                try {
                    const errData = await perplexityResponse.json();
                    errMsg = errData.error?.message || errMsg;
                } catch (e) { }
                throw new Error(`Erro na Perplexity: ${errMsg}`);
            }

            const perplexityData = await perplexityResponse.json();
            const searchContext = perplexityData.choices?.[0]?.message?.content || "Nenhuma informação adicional encontrada na busca.";

            // Extração de Citações da Perplexity
            // A API retorna um array "citations": ["url1", "url2"]
            // As citações no texto são markers [1], [2] etc.
            let extractedSources = [];
            if (perplexityData.citations) {
                extractedSources = perplexityData.citations.map((url, index) => ({
                    uri: url,
                    title: url // Perplexity geralmente retorna só a URL na lista
                }));
            }
            setSources(extractedSources);

            // --- PASSO 2: OPENAI (Análise) ---
            setStatus('analyzing_openai');

            const openAISystemPrompt = `Você é um verificador de fatos (fact-checker) especializado em política de Manaus/Amazonas.
      
      SUA MISSÃO: Determinar a veracidade da alegação com base no contexto fornecido.
      
      REGRAS DE VEREDITO:
      - SE o contexto confirmar com fontes oficiais -> VERDADEIRO (Confidence: High)
      - SE o contexto tiver desmentidos de agências de checagem (mesmo sem Rede Onda Digital) -> FALSO (Confidence: High)
      - SE o contexto mostrar que é antigo ou fora de contexto -> FALSO/ENGANOSO
      - SE não houver NENHUMA menção em fontes confiáveis e for uma alegação grave -> CUIDADO (Sem provas)
      
      IMPORTANTE: Não fique "em cima do muro". Se é boato conhecido, crave FALSO.

      Responda EXCLUSIVAMENTE um objeto JSON válido (sem markdown):
      {
        "status": "true" | "fake" | "warning" | "scam",
        "title": "Veredito Curto e Impactante",
        "message": "Explicação direta. Comece com 'É FALSO que...' ou 'É VERDADE que...'. Cite a fonte se houver.",
        "confidence": "XX%"
      }`;

            const openAIPayload = {
                model: "gpt-4o",
                response_format: { type: "json_object" },
                messages: [
                    { role: "system", content: openAISystemPrompt },
                    { role: "user", content: `CONTEXTO DA BUSCA (Perplexity):\n${searchContext}\n\nAnalise: "${textToSearch}"` }
                ]
            };

            const openAIResponse = await fetchWithRetry(OPENAI_API_URL, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${openAIKey}`,
                },
                body: JSON.stringify(openAIPayload)
            });

            if (!openAIResponse.ok) throw new Error("Erro na OpenAI");

            const openAIData = await openAIResponse.json();
            const aiContent = openAIData.choices?.[0]?.message?.content;

            const cleanJson = aiContent.replace(/```json|```/g, '').trim();
            const finalResult = JSON.parse(cleanJson);
            setResult(finalResult);
            setStatus('done');

        } catch (error) {
            console.error(error);
            setResult({
                status: 'warning',
                title: 'Erro no Processo',
                message: `Falha: ${error.message}. Verifique suas chaves.`,
                confidence: '0%'
            });
            setStatus('error');
        }
    };

    const StatusBadge = ({ status }) => {
        const styles = {
            fake: 'bg-red-100 text-red-700 border-red-200',
            true: 'bg-green-100 text-green-700 border-green-200',
            scam: 'bg-orange-100 text-orange-700 border-orange-200',
            warning: 'bg-yellow-100 text-yellow-800 border-yellow-200'
        };

        const labels = {
            fake: 'FALSO',
            true: 'VERDADEIRO',
            scam: 'GOLPE',
            warning: 'IMPRECISO'
        };
        const icons = {
            fake: <XCircle size={14} className="mr-1" />,
            true: <CheckCircle size={14} className="mr-1" />,
            scam: <AlertTriangle size={14} className="mr-1" />,
            warning: <AlertTriangle size={14} className="mr-1" />
        };

        return (
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold border ${styles[status] || styles.warning}`}>
                {icons[status]}
                {labels[status]}
            </span>
        );
    };

    return (
        <div className="min-h-screen bg-slate-50 font-sans text-slate-800 pb-20 md:pb-0 relative">

            {/* Hidden Card Template for Capture */}
            {result && (
                <div style={{ position: 'absolute', top: '-2000px', left: '-2000px' }}>
                    <div ref={cardRef} className="w-[600px] h-[600px] bg-slate-900 text-white p-10 flex flex-col justify-between relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-10 opacity-10"><Shield size={300} /></div>

                        <div className="z-10 flex items-center gap-4">
                            <div className="bg-emerald-600 p-3 rounded-xl"><Shield size={40} /></div>
                            <h1 className="text-3xl font-bold">VerdadeManaus</h1>
                        </div>

                        <div className="z-10 text-center">
                            <div className={`inline-block px-8 py-2 rounded-full text-3xl font-bold mb-6 border-4 ${result.status === 'fake' ? 'bg-red-600 border-red-400' :
                                result.status === 'true' ? 'bg-emerald-600 border-emerald-400' : 'bg-orange-500 border-orange-300'
                                }`}>
                                {result.status === 'fake' ? 'FALSO ❌' : result.status === 'true' ? 'VERDADEIRO ✅' : 'CUIDADO ⚠️'}
                            </div>
                            <h2 className="text-2xl font-bold mb-4 leading-tight">"{result.title}"</h2>
                            <p className="text-xl text-slate-300">{result.message}</p>
                        </div>

                        <div className="z-10 border-t border-slate-700 pt-6 flex justify-between items-center text-sm text-slate-400">
                            <span>Verificado por IA + Rede Onda Digital</span>
                            <span>{new Date().toLocaleDateString()}</span>
                        </div>
                    </div>
                </div>
            )}

            {/* Settings Modal */}
            {showSettingsModal && (
                <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
                    <div className="bg-white rounded-xl p-6 max-w-md w-full shadow-2xl animate-in zoom-in-95">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-lg font-bold flex items-center gap-2">
                                <Settings className="text-emerald-600" size={20} />
                                Configurar APIs (Híbrido)
                            </h3>
                            <button onClick={() => setShowSettingsModal(false)} className="text-slate-400 hover:text-slate-600">
                                <X size={20} />
                            </button>
                        </div>

                        <p className="text-sm text-slate-600 mb-4 bg-yellow-50 p-3 rounded border border-yellow-100">
                            Chave Perplexity é usada para buscas. OpenAI para análise e arquivos.
                        </p>

                        <div className="space-y-4">
                            {/* Oculta inputs se as chaves estiverem no ENV (Modo Cliente) */}
                            {(!ENV_OPENAI_KEY) && (
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">OpenAI API Key (Análise)</label>
                                    <input type="password" value={openAIKey} onChange={(e) => setOpenAIKey(e.target.value)} className="w-full p-3 border border-slate-300 rounded-lg outline-none font-mono text-sm" />
                                </div>
                            )}

                            {(!ENV_PERPLEXITY_KEY) && (
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Perplexity API Key (Busca/Verificação)</label>
                                    <input type="password" value={perplexityKey} onChange={(e) => setPerplexityKey(e.target.value)} placeholder="pplx-..." className="w-full p-3 border border-slate-300 rounded-lg outline-none font-mono text-sm" />
                                </div>
                            )}

                            {(ENV_OPENAI_KEY && ENV_PERPLEXITY_KEY) && (
                                <div className="p-4 bg-emerald-50 text-emerald-700 text-sm rounded-lg flex items-center gap-2">
                                    <Shield size={16} />
                                    <span>As chaves de API estão configuradas seguramente pelo administrador.</span>
                                </div>
                            )}
                        </div>
                        <button onClick={() => setShowSettingsModal(false)} className="mt-6 w-full bg-emerald-600 text-white py-3 rounded-lg font-bold hover:bg-emerald-700 transition">Salvar Configurações</button>
                    </div>
                </div>
            )}

            {/* Candidates Explorer Modal */}
            {
                showCandidatesModal && (
                    <div className="fixed inset-0 bg-black/60 z-[70] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
                        <div className="bg-white rounded-2xl p-6 max-w-2xl w-full shadow-2xl relative max-h-[80vh] overflow-y-auto flex flex-col">
                            <button
                                onClick={() => setShowCandidatesModal(false)}
                                className="absolute top-4 right-4 p-2 bg-slate-100 hover:bg-slate-200 rounded-full text-slate-500 transition z-10"
                            >
                                <X size={20} />
                            </button>

                            <div className="mb-6">
                                <h3 className="text-2xl font-bold text-slate-800 mb-2 flex items-center gap-2">
                                    <Search className="text-emerald-600" size={24} />
                                    Explorar Políticos
                                </h3>
                                <p className="text-slate-500 text-sm">Selecione para adicionar à sua barra de favoritos.</p>
                            </div>

                            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
                                {allTopics.map(topic => {
                                    const isSelected = tempSelectedTopics.includes(topic) || userTopics.includes(topic) || mainTopics.includes(topic);
                                    const isFixed = mainTopics.includes(topic);

                                    return (
                                        <button
                                            key={topic}
                                            disabled={isFixed} // Disable fixed topics from being toggled here (optional, or allow selection logic)
                                            onClick={() => {
                                                if (isFixed) return;
                                                setTempSelectedTopics(prev =>
                                                    prev.includes(topic)
                                                        ? prev.filter(t => t !== topic)
                                                        : [...prev, topic]
                                                );
                                            }}
                                            className={`p-4 rounded-xl border-2 text-left transition relative overflow-hidden group ${tempSelectedTopics.includes(topic) || userTopics.includes(topic)
                                                ? 'border-emerald-500 bg-emerald-50 text-emerald-800'
                                                : isFixed
                                                    ? 'border-slate-100 bg-slate-50 opacity-60 cursor-default'
                                                    : 'border-slate-100 bg-white hover:border-emerald-200 hover:shadow-md'
                                                }`}
                                        >
                                            <span className={`block font-bold text-sm mb-1 ${isSelected ? 'text-emerald-700' : 'text-slate-700'}`}>
                                                {topic}
                                            </span>
                                            <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold group-hover:text-emerald-500">
                                                {isFixed ? 'Padrão' : (userTopics.includes(topic) ? 'Adicionado' : 'Selecionar')}
                                            </span>
                                            {((tempSelectedTopics.includes(topic) || userTopics.includes(topic))) && (
                                                <div className="absolute top-3 right-3 text-emerald-600">
                                                    <CheckCircle size={16} />
                                                </div>
                                            )}
                                        </button>
                                    )
                                })}
                            </div>

                            <div className="mt-auto border-t border-slate-100 pt-4 flex justify-end gap-3">
                                <button
                                    onClick={() => {
                                        setTempSelectedTopics([]);
                                        setShowCandidatesModal(false);
                                    }}
                                    className="px-4 py-2 text-slate-500 hover:text-slate-700 font-bold"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={() => {
                                        // Add temp selections to userTopics, avoid duplicates
                                        const newFavorites = [...new Set([...userTopics, ...tempSelectedTopics])];
                                        setUserTopics(newFavorites);
                                        setTempSelectedTopics([]);
                                        setShowCandidatesModal(false);
                                    }}
                                    className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-2 rounded-lg font-bold shadow-lg shadow-emerald-200 transition"
                                >
                                    Adicionar aos Favoritos ({tempSelectedTopics.length})
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Header */}
            <header className="bg-white border-b border-slate-200 sticky top-0 z-50">
                <div className="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-2 cursor-pointer" onClick={() => setActiveTab('home')}>
                        <div className="bg-emerald-600 text-white p-1.5 rounded-lg">
                            <Shield size={20} />
                        </div>
                        <div>
                            <h1 className="text-lg font-bold text-slate-900 leading-none">Verdade<span className="text-emerald-600">Manaus</span></h1>
                            <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Monitor Eleitoral</p>
                        </div>
                    </div>
                    <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
                        <button onClick={() => setActiveTab('home')} className={`hover:text-emerald-600 transition ${activeTab === 'home' ? 'text-emerald-600' : ''}`}>Início</button>
                        <button onClick={() => setActiveTab('verify')} className={`hover:text-emerald-600 transition ${activeTab === 'verify' ? 'text-emerald-600' : ''}`}>Verificar</button>
                        <button onClick={() => setShowSettingsModal(true)} className={`p-2 rounded-full hover:bg-slate-100 transition ${(!openAIKey || !perplexityKey) ? 'text-orange-500 animate-pulse' : 'text-slate-400'}`}><Settings size={18} /></button>
                    </nav>
                    <div className="flex items-center gap-3 md:hidden">
                        {/* Admin Trigger (Secret Click on Settings) */}
                        <button onClick={(e) => {
                            if (e.detail === 3) { // Triple click to show inputs if hidden
                                alert("Modo Admin ativado");
                                setOpenAIKey(''); // Clear to force input if needed or handle logic
                            }
                            setShowSettingsModal(true)
                        }} className={`text-slate-600 ${(!openAIKey || !perplexityKey) ? 'text-orange-500' : ''}`}><Settings size={20} /></button>
                        <button className="text-slate-600" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>{mobileMenuOpen ? <X /> : <Menu />}</button>
                    </div>
                </div>
            </header>

            <main className="max-w-4xl mx-auto px-4 py-6">

                {/* VIEW: HOME */}
                {activeTab === 'home' && (
                    <div className="space-y-8 animate-in fade-in duration-500">

                        {/* HERO RESTAURADO: EMERALD/TEAL GRADIENT */}
                        <div className="bg-gradient-to-br from-emerald-700 to-teal-900 rounded-2xl p-6 md:p-10 text-white shadow-xl relative overflow-hidden">
                            <div className="absolute top-0 right-0 p-8 opacity-10">
                                <Shield size={180} />
                            </div>

                            <div className="relative z-10">
                                <h2 className="text-2xl md:text-3xl font-bold mb-3">Monitor: Rede Onda Digital</h2>
                                <p className="text-emerald-100 mb-6 max-w-lg">
                                    Usamos IA para comparar boatos com notícias oficiais do portal <span className="text-white font-bold">redeondadigital.com.br</span>.
                                </p>

                                <div
                                    onDragOver={handleDragOver}
                                    onDragLeave={handleDragLeave}
                                    onDrop={handleDrop}
                                    className={`bg-white p-2 rounded-xl shadow-lg flex flex-col md:flex-row gap-2 transition border-2 ${isDragging ? 'border-emerald-500 scale-105 bg-emerald-50' : 'border-transparent'}`}
                                >
                                    <input type="text" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={isDragging ? "Solte a imagem aqui!" : "Cole um boato ou link..."} className="flex-1 p-3 text-slate-800 placeholder-slate-400 focus:outline-none rounded-lg bg-transparent" />

                                    <button onClick={() => { handleSearch(); setActiveTab('verify'); }} className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-3 rounded-lg font-bold transition flex items-center justify-center gap-2">
                                        <Search size={18} /> Verificar
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Trending Section */}
                        <div>
                            <div className="mb-6">
                                <h3 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                                    <Zap size={22} className="text-emerald-500" />
                                    Em alta na política
                                </h3>
                                <p className="text-sm text-slate-500 font-medium mt-1 ml-8">Monitoramento da Rede Onda Digital</p>
                            </div>

                            {/* Politician Filter */}
                            <div className="flex gap-2 overflow-x-auto pb-4 mb-2 no-scrollbar items-center">
                                {displayTopics.map(topic => {
                                    const isUserFavorite = userTopics.includes(topic);
                                    return (
                                        <button
                                            key={topic}
                                            onClick={() => { setSelectedTopic(topic); trackInterest(topic); }}
                                            className={`whitespace-nowrap px-4 py-1.5 rounded-full text-xs font-bold border transition flex items-center gap-2 ${selectedTopic === topic
                                                ? 'bg-emerald-600 text-white border-emerald-600 shadow-md'
                                                : 'bg-white text-slate-600 border-slate-200 hover:border-emerald-400 hover:text-emerald-600'
                                                } ${isUserFavorite ? 'pr-2' : ''}`}
                                        >
                                            {topic}
                                            {isUserFavorite && (
                                                <span
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setUserTopics(prev => prev.filter(t => t !== topic));
                                                        if (selectedTopic === topic) setSelectedTopic('Geral');
                                                    }}
                                                    className="bg-white/20 hover:bg-red-500 hover:text-white rounded-full p-0.5 ml-1 transition"
                                                    title="Remover dos favoritos"
                                                >
                                                    <X size={10} />
                                                </span>
                                            )}
                                        </button>
                                    )
                                })}
                                {/* See More Button */}
                                <button
                                    onClick={() => setShowCandidatesModal(true)}
                                    className="whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-bold border border-slate-200 bg-slate-50 text-slate-500 hover:bg-emerald-50 hover:text-emerald-600 hover:border-emerald-200 transition flex items-center gap-1"
                                >
                                    <Search size={10} /> + Outros
                                </button>
                            </div>

                            {isLoadingNews ? (
                                <div className="grid gap-4 md:grid-cols-3 animate-pulse">
                                    {[1, 2, 3].map(i => <div key={i} className="h-32 bg-slate-100 rounded-xl"></div>)}
                                </div>
                            ) : trendingNews.length === 0 ? (
                                <div className="text-center p-8 text-slate-500">
                                    Nenhuma notícia encontrada para este tópico.
                                </div>
                            ) : (
                                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                                    {trendingNews.map((item, i) => (
                                        <div
                                            key={i}
                                            onClick={() => window.open(item.url, '_blank')}
                                            className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm hover:shadow-md transition cursor-pointer group hover:border-emerald-100"
                                        >
                                            <div className="flex justify-between items-start mb-3">
                                                <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-medium">{item.date || 'Recente'}</span>
                                                <ExternalLink size={12} className="text-slate-300 group-hover:text-emerald-500" />
                                            </div>
                                            <h4 className="font-bold text-slate-800 text-sm leading-snug mb-2 group-hover:text-emerald-700 transition" dangerouslySetInnerHTML={{ __html: item.headline }}></h4>
                                            <p className="text-xs text-slate-500 line-clamp-3">{item.description}</p>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Load More Button - Subtle Design */}
                            {hasMoreNews && (
                                <div className="mt-6 text-center pb-8">
                                    <button
                                        onClick={handleLoadMore}
                                        disabled={isLoadingNews}
                                        className="group text-sm font-medium text-emerald-600/80 hover:text-emerald-700 transition-all flex items-center justify-center gap-1 mx-auto disabled:opacity-50 py-2 px-4 rounded-lg hover:bg-emerald-50/50"
                                    >
                                        {isLoadingNews ? (
                                            <>
                                                <RefreshCw className="animate-spin" size={14} />
                                                Carregando...
                                            </>
                                        ) : (
                                            <>
                                                Carregar mais notícias
                                                <ChevronDown size={14} className="group-hover:translate-y-0.5 transition-transform" />
                                            </>
                                        )}
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* VIEW: VERIFY */}
                {activeTab === 'verify' && (
                    <div className="max-w-2xl mx-auto pt-4 animate-in slide-in-from-bottom-4 duration-500">
                        <button onClick={() => setActiveTab('home')} className="text-sm text-slate-500 hover:text-emerald-600 mb-4 flex items-center gap-1">← Voltar</button>
                        <div className="bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden">
                            <div
                                onDragOver={handleDragOver}
                                onDragLeave={handleDragLeave}
                                onDrop={handleDrop}
                                className={`p-6 border-b border-slate-100 bg-slate-50/50 transition border-2 ${isDragging ? 'border-emerald-500 bg-emerald-50' : 'border-transparent'}`}
                            >
                                {/* Header Explanation */}
                                <div className="mb-4">
                                    <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2 mb-2">
                                        <Shield size={20} className="text-emerald-600" />
                                        Verificador de Notícias
                                    </h2>
                                    <p className="text-sm text-slate-500 leading-relaxed">
                                        Cole o texto de uma notícia ou arraste uma imagem. Nossa IA vai buscar fontes confiáveis e analisar a veracidade da informação em segundos.
                                    </p>
                                </div>

                                {/* Input Area */}
                                <div className="relative">
                                    <textarea value={query} onChange={(e) => setQuery(e.target.value)} className={`w-full p-4 border rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none min-h-[120px] resize-none text-slate-700 font-medium ${isDragging ? 'bg-emerald-100 border-emerald-500' : 'border-slate-300'}`} placeholder={isDragging ? "Solte a imagem agora!" : "Cole o texto da notícia..."}></textarea>
                                </div>
                                <div className="mt-4 flex justify-end items-center">
                                    <button onClick={handleSearch} disabled={!query || status === 'searching_google' || status === 'analyzing_openai'} className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-2.5 rounded-lg font-bold transition flex items-center gap-2 disabled:bg-slate-300">
                                        {status !== 'idle' && status !== 'done' && status !== 'error' ? <RefreshCw className="animate-spin" size={18} /> : <Search size={18} />}
                                        Verificar
                                    </button>
                                </div>
                                {isTranscribing && <p className="text-xs text-emerald-600 mt-2 font-bold animate-pulse">Lendo arquivo com IA...</p>}
                            </div>

                            {/* Result & Actions */}
                            <div className="p-6 bg-slate-50 min-h-[200px]">
                                {/* Empty State: Usage Tips */}
                                {!result && status === 'idle' && (
                                    <div className="text-center">
                                        <p className="text-xs text-slate-400 uppercase tracking-wider font-bold mb-4">O que você pode verificar</p>
                                        <div className="grid grid-cols-3 gap-3">
                                            <div className="flex flex-col justify-center items-center bg-white p-4 rounded-xl border border-slate-100 hover:border-emerald-200 hover:shadow-sm transition cursor-default">
                                                <div className="text-2xl mb-2"><MessageCircle /></div>
                                                <p className="text-xs font-bold text-slate-700">Texto do WhatsApp</p>
                                                <p className="text-[10px] text-slate-400 mt-1">Mensagens suspeitas</p>
                                            </div>
                                            <div className="flex flex-col justify-center items-center bg-white p-4 rounded-xl border border-slate-100 hover:border-emerald-200 hover:shadow-sm transition cursor-default">
                                                <div className="text-2xl mb-2"><Link /></div>
                                                <p className="text-xs font-bold text-slate-700">Link da Notícia</p>
                                                <p className="text-[10px] text-slate-400 mt-1">Cole o link da notícia suspeita</p>
                                            </div>
                                            <div className="flex flex-col justify-center items-center bg-white p-4 rounded-xl border border-slate-100 hover:border-emerald-200 hover:shadow-sm transition cursor-default">
                                                <div className="text-2xl mb-2"><FileText /></div>
                                                <p className="text-xs font-bold text-slate-700">Notícia ou Boato</p>
                                                <p className="text-[10px] text-slate-400 mt-1">Cole o texto completo</p>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Loading State */}
                                {status !== 'idle' && status !== 'done' && status !== 'error' && (
                                    <div className="flex flex-col items-center justify-center h-full">
                                        <RefreshCw className="animate-spin text-emerald-600 mb-3" size={32} />
                                        <p className="text-sm text-slate-500 font-medium">Analisando informação...</p>
                                    </div>
                                )}

                                {result && status === 'done' && (
                                    <div className="w-full">
                                        <div className={`p-6 rounded-xl border-2 mb-6 text-center ${result.status === 'fake' ? 'bg-red-50 border-red-100' : result.status === 'true' ? 'bg-green-50 border-green-100' : 'bg-orange-50 border-orange-100'}`}>
                                            <div className="flex justify-center mb-4 text-4xl">{result.status === 'fake' ? '❌' : result.status === 'true' ? '✅' : '⚠️'}</div>
                                            <h3 className="text-2xl font-bold mb-2 text-slate-800">{result.title}</h3>
                                            <p className="text-slate-700">{result.message}</p>

                                            {/* WhatsApp Card Action */}
                                            <button onClick={generateCard} className="mt-6 bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-lg font-bold flex items-center justify-center gap-2 mx-auto transition shadow-lg shadow-green-200">
                                                <Share2 size={18} />
                                                Baixar Card para Zap
                                            </button>
                                        </div>

                                        {/* Fontes */}
                                        {sources.length > 0 && (
                                            <div className="mt-4 pt-4 border-t border-slate-200">
                                                <h4 className="flex items-center gap-2 text-sm font-bold text-slate-700 mb-2"><Globe size={16} /> Fontes (Prioridade: Rede Onda Digital):</h4>
                                                <ul className="text-xs space-y-2 text-slate-600 bg-white p-3 rounded-lg border border-slate-100">{sources.map((s, i) => <li key={i}><a href={s.uri} target="_blank" className="hover:text-emerald-600 underline">{s.title}</a></li>)}</ul>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}

            </main>

            {/* Footer with Onda Digital Logo */}
            <footer className="py-8 mt-auto border-t border-slate-100 bg-white">
                <div className="max-w-4xl mx-auto px-4 flex flex-col items-center justify-center gap-2">
                    <a href="https://redeondadigital.com.br" target="_blank" rel="noopener noreferrer" className="opacity-60 hover:opacity-100 transition-opacity">
                        <img src={logoOndaDigital} alt="Rede Onda Digital" className="h-12 object-contain" />
                    </a>
                    <p className="text-[10px] text-slate-400 uppercase tracking-wider">Powered by Rede Onda Digital</p>
                </div>
            </footer>
        </div>
    );
}
