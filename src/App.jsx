import React, { useState, useEffect, useRef } from 'react';
import { supabase } from './supabaseClient';
import { MessageSquare, Users, FileSpreadsheet, Send, CheckCircle, Trash2, Plus, X, Upload, Search, MapPin, Download, Rocket, Loader2 } from 'lucide-react';
import * as XLSX from 'xlsx';
import { setOptions, importLibrary } from '@googlemaps/js-api-loader';

function App() {
  // ... rest of state ...
  const [activeTab, setActiveTab] = useState('leads'); // 'leads', 'templates', or 'google'
  const [leadsSubTab, setLeadsSubTab] = useState('pendente'); // 'pendente' or 'enviado'
  const [leads, setLeads] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [loadingLeads, setLoadingLeads] = useState(true);
  const [loadingTemplates, setLoadingTemplates] = useState(true);

  // Modal state for sending message
  const [selectedLead, setSelectedLead] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Template modal state
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const [currentTemplate, setCurrentTemplate] = useState({ name: '', content: '' });

  // File upload state
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Apify state
  const [apifyQuery, setApifyQuery] = useState('');
  const [apifyStatus, setApifyStatus] = useState('idle'); // 'idle', 'running', 'done', 'error'
  const [apifyProgress, setApifyProgress] = useState('');
  const [apifyResults, setApifyResults] = useState([]);
  const [isSearchingApify, setIsSearchingApify] = useState(false);
  const [apifyRunId, setApifyRunId] = useState(null);

  const googleMapsRef = useRef(null);

  useEffect(() => {
    fetchLeads();
    fetchTemplates();
  }, []);

  const fetchLeads = async () => {
    setLoadingLeads(true);
    const { data, error } = await supabase
      .from('leads')
      .select('*')
      .order('created_at', { ascending: false });

    if (!error && data) {
      setLeads(data);
    }
    setLoadingLeads(false);
  };

  const fetchTemplates = async () => {
    setLoadingTemplates(true);
    const { data, error } = await supabase
      .from('templates')
      .select('*')
      .order('created_at', { ascending: false });

    if (!error && data) {
      setTemplates(data);
    }
    setLoadingTemplates(false);
  };

  // --- Google Places API Logic ---
  const searchGooglePlaces = async () => {
    if (!searchQuery || !locationQuery) {
      alert('Preencha o termo de busca e a cidade.');
      return;
    }

    const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
    if (!apiKey || apiKey === 'INSIRA_SUA_CHAVE_AQUI') {
      alert('Por favor, configure sua Google Maps API Key no arquivo .env');
      return;
    }

    setIsSearchingGoogle(true);
    setGoogleResults([]);

    try {
      setOptions({
        apiKey: apiKey,
        version: "weekly",
      });

      // Nova forma funcional de carregar bibliotecas do Google
      const { PlacesService, PlacesServiceStatus } = await importLibrary("places");

      // Precisamos de um elemento dummy para o PlacesService
      const service = new PlacesService(document.createElement('div'));

      const request = {
        query: `${searchQuery} em ${locationQuery}`,
        fields: ['name', 'place_id', 'formatted_address', 'geometry'],
      };

      service.textSearch(request, (results, status) => {
        if (status === PlacesServiceStatus.OK && results) {
          // Para cada resultado, precisamos pegar os detalhes (telefone)
          const detailPromises = results.slice(0, 10).map(place => {
            return new Promise((resolve) => {
              service.getDetails({
                placeId: place.place_id,
                fields: ['name', 'formatted_phone_number', 'international_phone_number', 'formatted_address']
              }, (details, detailStatus) => {
                if (detailStatus === PlacesServiceStatus.OK && details) {
                  resolve({
                    id: place.place_id,
                    name: details.name,
                    address: details.formatted_address,
                    phone: details.international_phone_number || details.formatted_phone_number || '',
                    imported: false
                  });
                } else {
                  resolve(null);
                }
              });
            });
          });

          Promise.all(detailPromises).then(completedResults => {
            setGoogleResults(completedResults.filter(r => r !== null && r.phone));
            setIsSearchingGoogle(false);
          });
        } else {
          alert(`Erro na busca do Google. Status: ${status}. \n\nIsso geralmente acontece se a 'Places API' não estiver ativa ou se o faturamento não estiver configurado.`);
          setIsSearchingGoogle(false);
        }
      });
    } catch (error) {
      console.error('Erro detalhado do Google Maps:', error);
      alert(`Erro ao carregar Google Maps: ${error.message || 'Verifique o console (F12) para detalhes'}`);
      setIsSearchingGoogle(false);
    }
  };

  const importGoogleLead = async (lead) => {
    const phone = lead.phone.replace(/\D/g, '');

    const { error } = await supabase.from('leads').insert([{
      restaurant_name: lead.name,
      phone: phone,
      status: 'pendente'
    }]);

    if (!error) {
      setGoogleResults(googleResults.map(r => r.id === lead.id ? { ...r, imported: true } : r));
      fetchLeads();
    } else {
      alert('Erro ao importar lead.');
    }
  };

  const importAllGoogleLeads = async () => {
    const leadsToImport = googleResults.filter(r => !r.imported).map(r => ({
      restaurant_name: r.name,
      phone: r.phone.replace(/\D/g, ''),
      status: 'pendente'
    }));

    if (leadsToImport.length === 0) return;

    const { error } = await supabase.from('leads').insert(leadsToImport);

    if (!error) {
      setGoogleResults(googleResults.map(r => ({ ...r, imported: true })));
      fetchLeads();
      alert(`${leadsToImport.length} leads importados!`);
    } else {
      alert('Erro ao importar leads.');
    }
  };

  // --- Apify API Logic ---
  const startApifyScrape = async () => {
    if (!apifyQuery) {
      alert('Preencha o termo de busca (Ex: Restaurantes em Diadema)');
      return;
    }

    const token = import.meta.env.VITE_APIFY_TOKEN;
    if (!token || token === 'seu_token_aqui') {
      alert('Por favor, configure seu Apify Token no arquivo .env');
      return;
    }

    setIsSearchingApify(true);
    setApifyStatus('running');
    setApifyProgress('Iniciando robô no Apify...');
    setApifyResults([]);

    try {
      // 1. Iniciar o Actor do Google Maps Scraper
      const runResponse = await fetch(`https://api.apify.com/v2/acts/nwjs7PZnc96uXZ9S0/runs?token=${token}`, {
        method: 'POST',
        mode: 'cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          searchQueries: [apifyQuery],
          maxItems: 30,
          languageCode: 'pt',
          exportPlaceUrls: false
        })
      });

      const runData = await runResponse.json();
      if (!runResponse.ok) throw new Error(runData.error?.message || 'Erro ao iniciar Apify');

      const runId = runData.data.id;
      setApifyRunId(runId);

      // 2. Polling para verificar status
      pollApifyStatus(runId, token);
    } catch (error) {
      console.error('Erro Apify:', error);
      alert(`Erro: ${error.message}`);
      setApifyStatus('error');
      setIsSearchingApify(false);
    }
  };

  const pollApifyStatus = async (runId, token) => {
    const interval = setInterval(async () => {
      try {
        const response = await fetch(`https://api.apify.com/v2/actor-runs/${runId}?token=${token}`);
        const data = await response.json();

        const status = data.data.status;
        setApifyProgress(`Status: ${status}...`);

        if (status === 'SUCCEEDED') {
          clearInterval(interval);
          setApifyProgress('Busca concluída! Buscando dados...');
          fetchApifyResults(data.data.defaultDatasetId, token);
        } else if (status === 'FAILED' || status === 'ABORTED' || status === 'TIMED-OUT') {
          clearInterval(interval);
          setApifyStatus('error');
          setIsSearchingApify(false);
          alert('O robô do Apify parou prematuramente.');
        }
      } catch (error) {
        clearInterval(interval);
        console.error('Erro no polling:', error);
      }
    }, 5000); // Checa a cada 5 segundos
  };

  const fetchApifyResults = async (datasetId, token) => {
    try {
      const response = await fetch(`https://api.apify.com/v2/datasets/${datasetId}/items?token=${token}`);
      const items = await response.json();

      // Filtra conforme as regras: Nota > 3.5 e Telefone Celular
      const filtered = items.filter(item => {
        const score = parseFloat(item.totalScore);
        const hasPhone = item.phone && item.phone.length > 0;
        return score > 3.5 && hasPhone;
      }).map(item => {
        // Limpeza do número de telefone (regra do 9 para celular BR)
        const digits = item.phone.replace(/\D/g, '');
        let number = digits.startsWith('55') ? digits.substring(2) : digits;
        const isMobile = number.length === 11 && number[2] === '9';

        return {
          id: item.placeId || Math.random().toString(),
          name: item.title,
          phone: isMobile ? `55${number}` : null,
          score: item.totalScore,
          address: item.address,
          imported: false
        };
      }).filter(item => item.phone !== null);

      setApifyResults(filtered);
      setApifyStatus('done');
      setIsSearchingApify(false);
    } catch (error) {
      console.error('Erro ao buscar dataset:', error);
      setApifyStatus('error');
      setIsSearchingApify(false);
    }
  };

  const importApifyLead = async (lead) => {
    const { error } = await supabase.from('leads').insert([{
      restaurant_name: lead.name,
      phone: lead.phone,
      status: 'pendente'
    }]);

    if (!error) {
      setApifyResults(apifyResults.map(r => r.id === lead.id ? { ...r, imported: true } : r));
      fetchLeads();
    } else {
      alert('Erro ao importar lead.');
    }
  };

  const importAllApifyLeads = async () => {
    const leadsToImport = apifyResults.filter(r => !r.imported).map(r => ({
      restaurant_name: r.name,
      phone: r.phone,
      status: 'pendente'
    }));

    if (leadsToImport.length === 0) return;

    const { error } = await supabase.from('leads').insert(leadsToImport);

    if (!error) {
      setApifyResults(apifyResults.map(r => ({ ...r, imported: true })));
      fetchLeads();
      alert(`${leadsToImport.length} leads importados!`);
    } else {
      alert('Erro ao importar leads.');
    }
  };

  // --- Excel Logic ---
  const handleFileUpload = async (file) => {
    setUploading(true);
    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const json = XLSX.utils.sheet_to_json(worksheet);

        const newLeads = json.map(row => {
          const keys = Object.keys(row);
          const phoneKey = keys.find(k => k.toLowerCase().includes('contato') || k.toLowerCase().includes('telefone') || k.toLowerCase().includes('numero') || k.toLowerCase().includes('whatsapp') || k.toLowerCase().includes('phone'));
          const nameKey = keys.find(k => k.toLowerCase().includes('restaurante') || k.toLowerCase().includes('nome') || k.toLowerCase().includes('title'));

          const phoneRaw = row[phoneKey] ? String(row[phoneKey]) : '';
          const phone = phoneRaw.replace(/\D/g, '');

          return {
            restaurant_name: row[nameKey] ? String(row[nameKey]) : 'Sem Nome',
            phone: phone,
            status: 'pendente'
          };
        }).filter(lead => lead.phone.length > 8);

        if (newLeads.length > 0) {
          const { error } = await supabase.from('leads').insert(newLeads);
          if (!error) {
            alert(`${newLeads.length} leads importados com sucesso!`);
            fetchLeads();
          } else {
            console.error(error);
            alert('Erro ao salvar no Supabase.');
          }
        } else {
          alert('Nenhum lead válido encontrado no arquivo.');
        }
        setUploading(false);
      };
      reader.readAsArrayBuffer(file);
    } catch (err) {
      console.error(err);
      alert('Erro ao processar o arquivo.');
      setUploading(false);
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

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  };

  const handleFileSelect = (e) => {
    if (e.target.files && e.target.files[0]) {
      handleFileUpload(e.target.files[0]);
    }
  };

  const openSendModal = (lead) => {
    setSelectedLead(lead);
    setIsModalOpen(true);
  };

  const handleSend = async (template) => {
    if (!selectedLead) return;

    let text = template.content.replace(/\{\{nome\}\}/gi, selectedLead.restaurant_name);

    let phone = selectedLead.phone;
    if (phone.length === 10 || phone.length === 11) {
      phone = '55' + phone;
    }

    const waLink = `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
    window.open(waLink, '_blank');

    const { error } = await supabase
      .from('leads')
      .update({ status: 'enviado' })
      .eq('id', selectedLead.id);

    if (!error) {
      setLeads(leads.map(l => l.id === selectedLead.id ? { ...l, status: 'enviado' } : l));
    }

    setIsModalOpen(false);
    setSelectedLead(null);
  };

  const saveTemplate = async () => {
    if (!currentTemplate.name || !currentTemplate.content) {
      alert('Preencha nome e conteúdo.');
      return;
    }

    if (currentTemplate.id) {
      const { error } = await supabase
        .from('templates')
        .update({ name: currentTemplate.name, content: currentTemplate.content })
        .eq('id', currentTemplate.id);

      if (!error) {
        fetchTemplates();
        setIsTemplateModalOpen(false);
      }
    } else {
      const { error } = await supabase
        .from('templates')
        .insert([{ name: currentTemplate.name, content: currentTemplate.content }]);

      if (!error) {
        fetchTemplates();
        setIsTemplateModalOpen(false);
      }
    }
  };

  const deleteTemplate = async (id) => {
    if (window.confirm('Tem certeza que deseja excluir?')) {
      const { error } = await supabase.from('templates').delete().eq('id', id);
      if (!error) {
        setTemplates(templates.filter(t => t.id !== id));
      }
    }
  };

  return (
    <div className="app-container">
      {/* Sidebar */}
      <div className="sidebar glass">
        <div className="logo">
          <MessageSquare size={28} color="#3b82f6" />
          Coudmsg
        </div>

        <ul className="nav-menu">
          <li className={`nav-item ${activeTab === 'leads' ? 'active' : ''}`} onClick={() => setActiveTab('leads')}>
            <Users size={20} />
            Lista de Leads
          </li>
          <li className={`nav-item ${activeTab === 'apify' ? 'active' : ''}`} onClick={() => setActiveTab('apify')}>
            <Rocket size={20} />
            Automação Apify
          </li>
          <li className={`nav-item ${activeTab === 'google' ? 'active' : ''}`} onClick={() => setActiveTab('google')}>
            <Search size={20} />
            Explorar Google (Local)
          </li>
          <li className={`nav-item ${activeTab === 'templates' ? 'active' : ''}`} onClick={() => setActiveTab('templates')}>
            <FileSpreadsheet size={20} />
            Modelos de MSG
          </li>
        </ul>
      </div>

      {/* Main Content */}
      <div className="main-content">
        {activeTab === 'leads' && (
          <div>
            <div className="flex-between mb-6">
              <div>
                <h1 className="text-gradient">Prospecção de Leads</h1>
                <p style={{ color: 'var(--text-secondary)' }}>Gerencie seus contatos e envie mensagens via WhatsApp.</p>
              </div>
            </div>

            <div className="card">
              <h3 className="mb-4">Importar Leads (Excel/CSV)</h3>
              <label htmlFor="file-upload" className="w-full block">
                <div
                  className={`upload-area ${isDragging ? 'drag-active' : ''}`}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                >
                  {uploading ? (
                    <div className="loader-spinner"></div>
                  ) : (
                    <>
                      <Upload size={32} color="var(--primary-color)" style={{ margin: '0 auto 12px' }} />
                      <p style={{ color: 'var(--text-primary)', fontWeight: '500' }}>Arraste o arquivo ou clique para selecionar</p>
                      <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginTop: '8px' }}>.xlsx ou .csv contendo colunas de Nome/Restaurante e Contato</p>
                    </>
                  )}
                </div>
              </label>
              <input
                id="file-upload"
                type="file"
                accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel"
                style={{ display: 'none' }}
                onChange={handleFileSelect}
              />
            </div>

            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: '24px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
                <h3 style={{ margin: 0 }}>Seus Leads</h3>
                <div className="flex-gap">
                  <button 
                    className={leadsSubTab === 'pendente' ? "btn-primary" : "btn-outline"} 
                    style={{ padding: '6px 16px', fontSize: '13px' }}
                    onClick={() => setLeadsSubTab('pendente')}
                  >
                    Pendentes ({leads.filter(l => l.status === 'pendente').length})
                  </button>
                  <button 
                    className={leadsSubTab === 'enviado' ? "btn-primary" : "btn-outline"} 
                    style={{ padding: '6px 16px', fontSize: '13px' }}
                    onClick={() => setLeadsSubTab('enviado')}
                  >
                    Já Enviados ({leads.filter(l => l.status === 'enviado').length})
                  </button>
                </div>
              </div>

              {loadingLeads ? (
                <div style={{ padding: '40px', textAlign: 'center' }}><div className="loader-spinner"></div></div>
              ) : (
                <div className="table-container">
                  <div className="table-header three-cols">
                    <div>Restaurante</div>
                    <div>WhatsApp</div>
                    <div>Ação</div>
                  </div>
                  {leads.filter(l => l.status === leadsSubTab).length === 0 ? (
                    <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                      {leadsSubTab === 'pendente' 
                        ? 'Nenhum lead pendente. Bom trabalho!' 
                        : 'Você ainda não enviou mensagens para nenhum lead.'}
                    </div>
                  ) : (
                    leads.filter(l => l.status === leadsSubTab).map(lead => (
                      <div className="table-row three-cols" key={lead.id}>
                        <div style={{ fontWeight: '500' }}>{lead.restaurant_name}</div>
                        <div>{lead.phone}</div>
                        <div>
                          <button className={lead.status === 'enviado' ? "btn-outline" : "btn-primary"} onClick={() => openSendModal(lead)} style={{ padding: '6px 12px', fontSize: '13px', width: '100%' }}>
                            <Send size={14} /> {lead.status === 'enviado' ? 'Reenviar' : 'Enviar'}
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'apify' && (
          <div>
            <div className="flex-between mb-6">
              <div>
                <h1 className="text-gradient">Automação Apify (Google Maps)</h1>
                <p style={{ color: 'var(--text-secondary)' }}>O robô vasculha o Google Maps para você, filtra os melhores e traz os WhatsApps validados.</p>
              </div>
            </div>

            <div className="card">
              <div className="search-grid apify-search">
                <div className="input-with-icon">
                  <Search size={18} className="icon" />
                  <input
                    type="text"
                    placeholder="O que busca e onde? (Ex: Pizzarias em Diadema)"
                    value={apifyQuery}
                    onChange={e => setApifyQuery(e.target.value)}
                    disabled={isSearchingApify}
                  />
                </div>
                <button
                  className="btn-primary"
                  onClick={startApifyScrape}
                  disabled={isSearchingApify}
                  style={{ minWidth: '180px' }}
                >
                  {isSearchingApify ? (
                    <><Loader2 className="animate-spin" size={18} /> Rodando...</>
                  ) : (
                    <><Rocket size={18} /> Iniciar Varredura</>
                  )}
                </button>
              </div>

              {isSearchingApify && (
                <div className="mt-4 p-4 glass" style={{ borderRadius: '8px', textAlign: 'center' }}>
                  <p className="pulse">{apifyProgress}</p>
                </div>
              )}
            </div>

            {apifyResults.length > 0 && (
              <div className="flex-between mb-4">
                <h3>Leads Qualificados Encontrados ({apifyResults.length})</h3>
                <button className="btn-success" onClick={importAllApifyLeads}>
                  <Download size={18} /> Importar Todos para o Banco
                </button>
              </div>
            )}

            <div className="results-grid">
              {apifyResults.map(result => (
                <div className={`result-card ${result.imported ? 'imported' : ''}`} key={result.id}>
                  <div className="result-info">
                    <div className="flex-between" style={{ marginBottom: '8px' }}>
                      <h4>{result.name}</h4>
                      <span className="badge badge-sent">⭐ {result.score}</span>
                    </div>
                    <p className="result-phone">{result.phone}</p>
                    <p className="result-address">{result.address}</p>
                  </div>
                  <button
                    className={result.imported ? "btn-disabled" : "btn-outline"}
                    onClick={() => !result.imported && importApifyLead(result)}
                    disabled={result.imported}
                  >
                    {result.imported ? 'Importado' : 'Importar Lead'}
                  </button>
                </div>
              ))}
              {apifyStatus === 'done' && apifyResults.length === 0 && (
                <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
                  A varredura terminou, mas nenhum lead atendeu aos critérios (Nota &gt; 3.5 e WhatsApp Celular).
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'google' && (
          <div>
            <div className="flex-between mb-6">
              <div>
                <h1 className="text-gradient">Explorar Google Maps (Nativo)</h1>
                <p style={{ color: 'var(--text-secondary)' }}>Busca rápida usando a sua própria chave do Google. Mais rápido, porém mais limitado em detalhes.</p>
              </div>
            </div>

            <div className="card">
              <div className="search-grid">
                <div className="input-with-icon">
                  <Search size={18} className="icon" />
                  <input
                    type="text"
                    placeholder="O que busca? (Ex: Pizzarias, Hamburguerias)"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                  />
                </div>
                <div className="input-with-icon">
                  <MapPin size={18} className="icon" />
                  <input
                    type="text"
                    placeholder="Em qual cidade? (Ex: São Paulo, SP)"
                    value={locationQuery}
                    onChange={e => setLocationQuery(e.target.value)}
                  />
                </div>
                <button className="btn-primary" onClick={searchGooglePlaces} disabled={isSearchingGoogle}>
                  {isSearchingGoogle ? 'Buscando...' : 'Buscar Leads'}
                </button>
              </div>
            </div>

            {googleResults.length > 0 && (
              <div className="flex-between mb-4">
                <h3>Resultados Encontrados ({googleResults.length})</h3>
                <button className="btn-success" onClick={importAllGoogleLeads}>
                  <Download size={18} /> Importar Todos
                </button>
              </div>
            )}

            <div className="results-grid">
              {isSearchingGoogle ? (
                <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '60px' }}>
                  <div className="loader-spinner" style={{ margin: '0 auto' }}></div>
                  <p style={{ marginTop: '16px', color: 'var(--text-secondary)' }}>Vasculhando o Google Maps para você...</p>
                </div>
              ) : (
                googleResults.map(result => (
                  <div className={`result-card ${result.imported ? 'imported' : ''}`} key={result.id}>
                    <div className="result-info">
                      <h4>{result.name}</h4>
                      <p className="result-phone">{result.phone}</p>
                      <p className="result-address">{result.address}</p>
                    </div>
                    <button
                      className={result.imported ? "btn-disabled" : "btn-outline"}
                      onClick={() => !result.imported && importGoogleLead(result)}
                      disabled={result.imported}
                    >
                      {result.imported ? 'Importado' : 'Importar'}
                    </button>
                  </div>
                ))
              )}
              {!isSearchingGoogle && googleResults.length === 0 && searchQuery && (
                <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
                  Nenhum resultado para exibir. Tente uma busca diferente.
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'templates' && (
          <div>
            <div className="flex-between mb-6">
              <div>
                <h1 className="text-gradient">Modelos de Mensagem</h1>
                <p style={{ color: 'var(--text-secondary)' }}>Crie templates usando <strong style={{ color: 'white' }}>{`{{nome}}`}</strong> para substituir pelo nome do restaurante.</p>
              </div>
              <button className="btn-primary" onClick={() => {
                setCurrentTemplate({ name: '', content: '' });
                setIsTemplateModalOpen(true);
              }}>
                <Plus size={18} /> Novo Modelo
              </button>
            </div>

            {loadingTemplates ? (
              <div className="loader-spinner"></div>
            ) : (
              <div className="template-grid">
                {templates.filter(t => t.name.toLowerCase().includes('prospeccao')).map(template => (
                  <div className="template-card" key={template.id}>
                    <h3 style={{ fontSize: '16px', fontWeight: '600' }}>{template.name}</h3>
                    <div className="template-content">{template.content}</div>
                    <div className="template-actions">
                      <button className="btn-outline" style={{ flex: 1, padding: '8px' }} onClick={() => {
                        setCurrentTemplate(template);
                        setIsTemplateModalOpen(true);
                      }}>Editar</button>
                      <button className="btn-danger" style={{ padding: '8px' }} onClick={() => deleteTemplate(template.id)}>
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))}
                {templates.filter(t => t.name.toLowerCase().includes('prospeccao')).length === 0 && (
                  <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
                    Nenhum modelo de Prospecção cadastrado.
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modals */}
      {isModalOpen && selectedLead && (
        <div className="modal-overlay" onClick={() => setIsModalOpen(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setIsModalOpen(false)}><X size={24} /></button>
            <div className="modal-header">
              <h2 className="modal-title">Escolha o Modelo</h2>
              <p style={{ color: 'var(--text-secondary)' }}>Enviando para: <strong style={{ color: 'white' }}>{selectedLead.restaurant_name}</strong></p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {templates.filter(t => t.name.toLowerCase().includes('prospeccao')).length === 0 ? (
                <p style={{ color: 'var(--warning-color)' }}>Nenhum modelo de Prospecção disponível.</p>
              ) : (
                templates.filter(t => t.name.toLowerCase().includes('prospeccao')).map(template => (
                  <button
                    key={template.id}
                    className="btn-outline"
                    style={{ justifyContent: 'space-between', padding: '16px', textAlign: 'left', width: '100%' }}
                    onClick={() => handleSend(template)}
                  >
                    <span>{template.name}</span>
                    <Send size={18} color="var(--primary-color)" />
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {isTemplateModalOpen && (
        <div className="modal-overlay" onClick={() => setIsTemplateModalOpen(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setIsTemplateModalOpen(false)}><X size={24} /></button>
            <div className="modal-header">
              <h2 className="modal-title">{currentTemplate.id ? 'Editar Modelo' : 'Novo Modelo'}</h2>
            </div>

            <div className="mb-4">
              <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-secondary)', fontSize: '14px' }}>Nome do Modelo</label>
              <input
                type="text"
                value={currentTemplate.name}
                onChange={e => setCurrentTemplate({ ...currentTemplate, name: e.target.value })}
                placeholder="Ex: Abordagem Inicial..."
              />
            </div>

            <div className="mb-6">
              <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-secondary)', fontSize: '14px' }}>Conteúdo da Mensagem</label>
              <textarea
                rows={6}
                value={currentTemplate.content}
                onChange={e => setCurrentTemplate({ ...currentTemplate, content: e.target.value })}
                placeholder={`Olá {{nome}}...`}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button className="btn-outline" onClick={() => setIsTemplateModalOpen(false)}>Cancelar</button>
              <button className="btn-primary" onClick={saveTemplate}>Salvar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
