import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Copy,
  KeyRound,
  RefreshCw,
  ShieldAlert,
  Unplug,
  Wrench,
  XCircle,
} from 'lucide-react';
import { authorizeGoogleApisViaPopup, GOOGLE_SERVICE_SCOPES } from '../../lib/firebase';
import { apiFetch } from '../../lib/api';
import {
  AdminProfileResponse,
  DiagnosticsOverviewResponse,
  DiagnosticStatus,
  GoogleServiceDiagnostic,
} from '../../types/seo';

interface GoogleConnectionsViewProps {
  profile: AdminProfileResponse;
  onRefreshProfile: () => Promise<void>;
}

function statusColorClass(status: DiagnosticStatus): string {
  switch (status) {
    case 'Connected':
      return 'text-[#16A34A] border-[#16A34A]/30 bg-[#F0FDF4]';
    case 'Authorization Required':
    case 'Token Expired':
      return 'text-[#D97706] border-[#D97706]/30 bg-[#FFFBEB]';
    case 'API Not Enabled':
    case 'Permission Missing':
    case 'Configuration Error':
    case 'Connection Failed':
      return 'text-[#DC2626] border-[#DC2626]/30 bg-[#FEF2F2]';
    case 'Not Available':
    default:
      return 'text-[#5C635E] border-[#E6E0D6] bg-[#FAF8F4]';
  }
}

export const GoogleConnectionsView: React.FC<GoogleConnectionsViewProps> = ({
  profile,
  onRefreshProfile,
}) => {
  const [selectedServices, setSelectedServices] = useState({
    searchConsole: true,
    blogger: true,
    analytics: false,
    ads: false,
  });
  const [diagData, setDiagData] = useState<DiagnosticsOverviewResponse | null>(null);
  const [loadingDiag, setLoadingDiag] = useState(true);
  const [testingService, setTestingService] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copiedUri, setCopiedUri] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadDiagnostics = async () => {
    setLoadingDiag(true);
    try {
      const data = await apiFetch<DiagnosticsOverviewResponse>('/api/diagnostics/status');
      setDiagData(data);
    } catch (err: any) {
      setError(err?.message || 'Unable to load Google integration diagnostics.');
    } finally {
      setLoadingDiag(false);
    }
  };

  useEffect(() => {
    loadDiagnostics();
  }, []);

  // Listen for OAuth popup postMessage completion (Authorization Code Flow)
  useEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      const origin = event.origin || '';
      if (!origin.endsWith('.run.app') && !origin.includes('localhost')) {
        return;
      }
      if (event.data?.type === 'GOOGLE_API_OAUTH_SUCCESS') {
        setBusy(false);
        setError(null);
        setMessage('Google API access authorized via offline OAuth code flow and verified.');
        await Promise.all([onRefreshProfile(), loadDiagnostics()]);
      } else if (event.data?.type === 'GOOGLE_API_OAUTH_ERROR') {
        setBusy(false);
        setError(
          `[${event.data?.errorCode || 'oauth_error'}] ${
            event.data?.message || 'Google OAuth authorization failed.'
          }`
        );
        await loadDiagnostics();
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const buildSelectedScopes = (services = selectedServices) => {
    const scopes: string[] = [];
    if (services.searchConsole) {
      scopes.push(GOOGLE_SERVICE_SCOPES.searchConsoleReadonly);
      scopes.push(GOOGLE_SERVICE_SCOPES.searchConsole);
    }
    if (services.blogger) scopes.push(GOOGLE_SERVICE_SCOPES.blogger);
    if (services.analytics) scopes.push(GOOGLE_SERVICE_SCOPES.analytics);
    if (services.ads) scopes.push(GOOGLE_SERVICE_SCOPES.ads);
    return scopes;
  };

  const handleConnectGoogle = async (overrideServices?: typeof selectedServices) => {
    const svc = overrideServices || selectedServices;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const serviceKeys = Object.entries(svc)
        .filter(([, enabled]) => enabled)
        .map(([key]) => key)
        .join(',');

      // 1. Prefer backend Authorization Code Flow when GOOGLE_CLIENT_ID & GOOGLE_CLIENT_SECRET are configured
      const urlData = await apiFetch<{
        configured: boolean;
        mode: string;
        authUrl?: string;
        redirectUri: string;
      }>(`/api/oauth/google/url?services=${encodeURIComponent(serviceKeys || 'blogger,searchConsole')}`);

      if (urlData.configured && urlData.authUrl) {
        const popup = window.open(
          urlData.authUrl,
          'treewalley_google_api_oauth',
          'width=620,height=720'
        );
        if (!popup) {
          setBusy(false);
          setError(
            'Browser popup was blocked. Allow popups for this site and click Connect / Reconnect again.'
          );
          return;
        }
        // Keep busy until popup completes or closes
        const pollTimer = window.setInterval(() => {
          if (popup.closed) {
            window.clearInterval(pollTimer);
            setBusy(false);
            loadDiagnostics();
          }
        }, 800);
        return;
      }

      // 2. Fallback: Separate Firebase GoogleAuthProvider incremental API authorization popup
      const scopes = buildSelectedScopes(svc);
      const authRes = await authorizeGoogleApisViaPopup(scopes);
      if (!authRes.accessToken) {
        throw new Error(
          'Google did not return an OAuth access token. Ensure popups are allowed and grant all requested API checkboxes.'
        );
      }

      await apiFetch('/api/connections/google', {
        method: 'POST',
        body: JSON.stringify({
          accessToken: authRes.accessToken,
          scopes,
          connectedEmail: authRes.user.email,
        }),
      });

      await Promise.all([onRefreshProfile(), loadDiagnostics()]);
      setMessage(
        'Google API access token verified via Google tokeninfo, encrypted server-side, and live integration tests executed.'
      );
    } catch (err: any) {
      setError(err?.message || 'Failed to authorize Google services.');
    } finally {
      setBusy(false);
    }
  };

  const handleTestConnection = async (
    service: 'all' | 'login' | 'blogger' | 'searchConsole' | 'trends'
  ) => {
    setTestingService(service);
    setError(null);
    setMessage(null);
    try {
      const updated = await apiFetch<DiagnosticsOverviewResponse>('/api/diagnostics/test', {
        method: 'POST',
        body: JSON.stringify({ service }),
      });
      setDiagData(updated);
      await onRefreshProfile();
      setMessage(`Real API diagnostic test completed for ${service === 'all' ? 'all services' : service}.`);
    } catch (err: any) {
      setError(err?.message || 'Integration test failed.');
    } finally {
      setTestingService(null);
    }
  };

  const handleRevoke = async () => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await apiFetch('/api/connections/google/revoke', { method: 'POST' });
      await Promise.all([onRefreshProfile(), loadDiagnostics()]);
      setMessage('Google OAuth tokens revoked and wiped from encrypted Cloud SQL storage.');
    } catch (err: any) {
      setError(err?.message || 'Revocation failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleCopy = (val: string) => {
    navigator.clipboard?.writeText(val).then(() => {
      setCopiedUri(val);
      setTimeout(() => setCopiedUri(null), 2000);
    });
  };

  const conn = profile.googleConnection;
  const isConnected = conn?.status === 'connected';
  const diagnosticCards: GoogleServiceDiagnostic[] = diagData
    ? [
        diagData.diagnostics.login,
        diagData.diagnostics.blogger,
        diagData.diagnostics.searchConsole,
        diagData.diagnostics.trends,
      ]
    : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-[#E6E0D6] pb-5">
        <div>
          <h1 className="font-display text-3xl font-bold text-[#1D221F]">
            Google Integrations &amp; Diagnostics
          </h1>
          <p className="mt-1 text-xs text-[#5C635E]">
            Separate Google Login from Blogger &amp; Search Console API authorization with live endpoint verification, AES-256-GCM encryption, and Cloud Console checklist.
          </p>
        </div>

        <button
          type="button"
          onClick={() => handleTestConnection('all')}
          disabled={Boolean(testingService)}
          className="px-4 py-2 text-xs font-medium rounded-md bg-[#1B4332] text-[#FAF8F4] hover:bg-[#143325] disabled:opacity-50 flex items-center gap-2 cursor-pointer whitespace-nowrap shrink-0"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${testingService === 'all' ? 'animate-spin' : ''}`} />
          <span>{testingService === 'all' ? 'Running Live Checks...' : 'Test All Integrations'}</span>
        </button>
      </div>

      {message && (
        <div className="p-3.5 rounded-md border border-[#16A34A]/30 bg-[#F0FDF4] text-[#166534] text-xs">
          {message}
        </div>
      )}
      {error && (
        <div className="p-3.5 rounded-md border border-[#DC2626]/30 bg-[#FEF2F2] text-[#991B1B] text-xs flex items-start gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* 1. Google Integration Diagnostics Panel (4 Separate Service Cards) */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-xl font-bold text-[#1D221F]">
            Google Integration Diagnostics Panel
          </h2>
          {diagData && (
            <div className="text-xs text-[#5C635E] font-mono-tabular">
              Token Mode:{' '}
              <strong className="text-[#1D221F]">
                {diagData.oauthMode === 'oauth_code_offline'
                  ? diagData.hasRefreshToken
                    ? 'Offline OAuth Code (Auto-Refresh Active)'
                    : 'OAuth Code Flow (No Refresh Token)'
                  : diagData.oauthMode === 'firebase_popup'
                  ? 'Temporary Popup Token (~1h, No Refresh Token)'
                  : 'Not Authorized'}
              </strong>
              {diagData.tokenExpiresAt && (
                <span> · Expires {new Date(diagData.tokenExpiresAt).toLocaleTimeString()}</span>
              )}
            </div>
          )}
        </div>

        {loadingDiag && !diagData ? (
          <div className="bg-white border border-[#E6E0D6] rounded-lg p-6 text-xs text-[#5C635E]">
            Loading integration diagnostics...
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {diagnosticCards.map((card, idx) => {
              const isTestingThis = testingService === card.service || testingService === 'all';
              const canReconnect = card.service === 'blogger' || card.service === 'searchConsole';

              return (
                <div
                  key={card.service}
                  className="bg-white border border-[#E6E0D6] rounded-lg p-5 flex flex-col justify-between space-y-4"
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-[11px] font-mono-tabular text-[#6F4E37]">
                          0{idx + 1} · INTEGRATION SERVICE
                        </div>
                        <h3 className="font-display text-lg font-bold text-[#1D221F]">
                          {card.label}
                        </h3>
                      </div>
                      <span
                        className={`px-2.5 py-1 text-[11px] font-semibold rounded border whitespace-nowrap ${statusColorClass(
                          card.status
                        )}`}
                      >
                        {card.status}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs border-t border-b border-[#F0ECE4] py-2.5">
                      <div>
                        <span className="text-[#5C635E]">Connected Account:</span>
                        <div className="font-mono-tabular text-[#1D221F] truncate">
                          {card.connectedEmail || 'None'}
                        </div>
                      </div>
                      <div>
                        <span className="text-[#5C635E]">Permission Status:</span>
                        <div
                          className={`font-medium ${
                            card.permissionOk ? 'text-[#16A34A]' : 'text-[#D97706]'
                          }`}
                        >
                          {card.permissionOk
                            ? 'Granted & Verified'
                            : card.status === 'API Not Enabled'
                            ? 'Scope Granted · Enable API in GCP'
                            : card.requiredScopes.length > 0
                            ? 'Missing / Unverified'
                            : 'N/A'}
                        </div>
                      </div>
                      <div>
                        <span className="text-[#5C635E]">Last Tested:</span>
                        <div className="font-mono-tabular text-[#1D221F]">
                          {card.lastTestedAt
                            ? new Date(card.lastTestedAt).toLocaleString()
                            : 'Never tested'}
                        </div>
                      </div>
                      <div>
                        <span className="text-[#5C635E]">Last HTTP Status:</span>
                        <div className="font-mono-tabular text-[#1D221F]">
                          {card.lastHttpStatus ? `HTTP ${card.lastHttpStatus}` : '—'}
                          {card.lastErrorCode ? ` (${card.lastErrorCode})` : ''}
                        </div>
                      </div>
                    </div>

                    {card.requiredScopes.length > 0 && (
                      <div className="text-[11px] text-[#5C635E]">
                        <span className="font-medium text-[#49504B]">Required Scope:</span>{' '}
                        <span className="font-mono-tabular break-all">
                          {card.requiredScopes.join(', ')}
                        </span>
                      </div>
                    )}

                    {card.lastErrorMessage ? (
                      <div className="p-2.5 rounded bg-[#FEF2F2] border border-[#DC2626]/20 text-[11px] text-[#991B1B] leading-relaxed space-y-1.5">
                        <div>{card.lastErrorMessage}</div>
                        {card.details && card.details !== card.lastErrorMessage && (
                          <div className="font-mono-tabular text-[10px] opacity-85 break-words">
                            Detail: {card.details}
                          </div>
                        )}
                        {(() => {
                          const match = (card.details || '').match(/https:\/\/console\.(?:developers|cloud)\.google\.com\/[^\s,)]+/);
                          if (!match) return null;
                          return (
                            <div>
                              <a
                                href={match[0]}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-block font-semibold underline text-[#1B4332] hover:text-[#143325]"
                              >
                                Enable API in Google Cloud Console &rarr;
                              </a>
                            </div>
                          );
                        })()}
                      </div>
                    ) : card.details ? (
                      <div className="p-2.5 rounded bg-[#FAF8F4] border border-[#E6E0D6] text-[11px] text-[#49504B] leading-relaxed">
                        {card.details}
                      </div>
                    ) : null}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => handleTestConnection(card.service)}
                      disabled={isTestingThis}
                      className="px-3 py-1.5 text-xs font-medium rounded-md border border-[#E6E0D6] hover:bg-[#FAF8F4] text-[#1D221F] disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
                    >
                      <RefreshCw
                        className={`w-3.5 h-3.5 ${isTestingThis ? 'animate-spin' : ''}`}
                      />
                      <span>Test Connection</span>
                    </button>

                    {canReconnect && (
                      <button
                        type="button"
                        onClick={() =>
                          handleConnectGoogle({
                            searchConsole: card.service === 'searchConsole' || selectedServices.searchConsole,
                            blogger: card.service === 'blogger' || selectedServices.blogger,
                            analytics: selectedServices.analytics,
                            ads: selectedServices.ads,
                          })
                        }
                        disabled={busy}
                        className="px-3 py-1.5 text-xs font-medium rounded-md bg-[#1B4332] text-[#FAF8F4] hover:bg-[#143325] disabled:opacity-50 cursor-pointer"
                      >
                        Reconnect
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 2. Separate Google API Authorization + Cloud Configuration Checker */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border border-[#E6E0D6] rounded-lg p-6 space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-xl font-bold text-[#1D221F]">
              Google API Authorization
            </h2>
            <span
              className={`text-xs font-medium ${
                isConnected ? 'text-[#16A34A]' : 'text-[#D97706]'
              }`}
            >
              {isConnected ? `Authorized · ${conn.connectedEmail}` : 'Authorization Required'}
            </span>
          </div>

          <p className="text-xs text-[#5C635E] leading-relaxed">
            Google Sign-In only authenticates your admin session (<span className="font-mono-tabular">openid email profile</span>). Use this control to authorize and refresh permissions for Blogger and Google Search Console.
          </p>

          <div className="p-3 rounded-md border border-[#B68D40]/40 bg-[#FFFDF7] text-[11px] text-[#49504B] leading-relaxed">
            <strong>OAuth Testing Mode Prompt:</strong> When Google displays{' '}
            <em>&ldquo;Google hasn&rsquo;t verified this app (currently being tested)&rdquo;</em>, this is normal for private single-admin OAuth clients. Click <strong>Continue</strong> (or <strong>Advanced &rarr; Go to app</strong>) and approve all requested permission checkboxes. Note: refresh tokens in Testing mode expire every 7 days and can be renewed with one click on <strong>Reconnect</strong>.
          </div>

          <div className="space-y-2.5 text-xs">
            <label className="flex items-start gap-3 p-3 border border-[#E6E0D6] rounded-md cursor-pointer hover:bg-[#FAF8F4]">
              <input
                type="checkbox"
                checked={selectedServices.searchConsole}
                onChange={(e) =>
                  setSelectedServices((s) => ({ ...s, searchConsole: e.target.checked }))
                }
                className="mt-0.5 accent-[#1B4332]"
              />
              <div>
                <div className="font-semibold text-[#1D221F]">
                  Google Search Console &amp; URL Inspection API
                </div>
                <div className="text-[#5C635E] mt-0.5 font-mono-tabular text-[11px]">
                  webmasters.readonly + webmasters
                </div>
              </div>
            </label>

            <label className="flex items-start gap-3 p-3 border border-[#E6E0D6] rounded-md cursor-pointer hover:bg-[#FAF8F4]">
              <input
                type="checkbox"
                checked={selectedServices.blogger}
                onChange={(e) =>
                  setSelectedServices((s) => ({ ...s, blogger: e.target.checked }))
                }
                className="mt-0.5 accent-[#1B4332]"
              />
              <div>
                <div className="font-semibold text-[#1D221F]">Google Blogger API v3</div>
                <div className="text-[#5C635E] mt-0.5 font-mono-tabular text-[11px]">
                  https://www.googleapis.com/auth/blogger
                </div>
              </div>
            </label>

            <label className="flex items-start gap-3 p-3 border border-[#E6E0D6] rounded-md cursor-pointer hover:bg-[#FAF8F4]">
              <input
                type="checkbox"
                checked={selectedServices.analytics}
                onChange={(e) =>
                  setSelectedServices((s) => ({ ...s, analytics: e.target.checked }))
                }
                className="mt-0.5 accent-[#1B4332]"
              />
              <div>
                <div className="font-semibold text-[#1D221F]">
                  Google Analytics Data API (GA4) — Optional
                </div>
                <div className="text-[#5C635E] mt-0.5 font-mono-tabular text-[11px]">
                  analytics.readonly
                </div>
              </div>
            </label>

            <label className="flex items-start gap-3 p-3 border border-[#E6E0D6] rounded-md cursor-pointer hover:bg-[#FAF8F4]">
              <input
                type="checkbox"
                checked={selectedServices.ads}
                onChange={(e) =>
                  setSelectedServices((s) => ({ ...s, ads: e.target.checked }))
                }
                className="mt-0.5 accent-[#1B4332]"
              />
              <div>
                <div className="font-semibold text-[#1D221F]">
                  Google Ads Keyword Planning API — Optional
                </div>
                <div className="text-[#5C635E] mt-0.5 font-mono-tabular text-[11px]">
                  adwords (also requires GOOGLE_ADS_DEVELOPER_TOKEN)
                </div>
              </div>
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <button
              type="button"
              onClick={() => handleConnectGoogle()}
              disabled={busy}
              className="px-4 py-2 text-xs font-medium rounded-md bg-[#1B4332] text-[#FAF8F4] hover:bg-[#143325] disabled:opacity-50 flex items-center gap-2 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${busy ? 'animate-spin' : ''}`} />
              <span>
                {isConnected
                  ? 'Reconnect / Refresh Google APIs'
                  : 'Connect Google API Services'}
              </span>
            </button>

            {isConnected && (
              <button
                type="button"
                onClick={handleRevoke}
                disabled={busy}
                className="px-4 py-2 text-xs font-medium rounded-md border border-[#DC2626]/40 text-[#DC2626] hover:bg-[#FEF2F2] flex items-center gap-2 cursor-pointer"
              >
                <Unplug className="w-3.5 h-3.5" />
                <span>Disconnect &amp; Revoke Access</span>
              </button>
            )}
          </div>

          <div className="pt-3 border-t border-[#F0ECE4] space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-[#49504B]">Single-Admin Allowlist</span>
              <span className="font-mono-tabular text-[#16A34A] flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                {profile.settings?.allowlistedEmail}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[#49504B]">Token Encryption</span>
              <span className="font-mono-tabular text-[#1B4332] flex items-center gap-1">
                <KeyRound className="w-3.5 h-3.5" />
                AES-256-GCM (Server-Side Only)
              </span>
            </div>
          </div>
        </div>

        {/* Google Cloud Configuration Checker */}
        <div className="bg-white border border-[#E6E0D6] rounded-lg p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-xl font-bold text-[#1D221F] flex items-center gap-2">
              <Wrench className="w-5 h-5 text-[#B68D40]" />
              <span>Google Cloud Configuration Checker</span>
            </h2>
          </div>

          {diagData && (
            <>
              {!diagData.oauthEnvConfigured && (
                <div className="p-3 rounded-md border border-[#D97706]/40 bg-[#FFFBEB] text-[11px] text-[#92400E] leading-relaxed">
                  <strong>Missing Offline OAuth Secrets:</strong> Add{' '}
                  <span className="font-mono-tabular font-semibold">
                    {diagData.missingSecrets.join(', ')}
                  </span>{' '}
                  in Environment Secrets to enable server-side Authorization Code Flow with automatic refresh tokens. Until added, authorization uses temporary ~1h Firebase popup tokens.
                </div>
              )}

              <div className="space-y-2.5 text-xs">
                {diagData.configChecks.map((chk) => (
                  <div
                    key={chk.id}
                    className="p-2.5 rounded border border-[#F0ECE4] bg-[#FAF8F4]/50 space-y-1"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-[#1D221F] flex items-center gap-1.5">
                        {chk.status === 'ok' && (
                          <CheckCircle2 className="w-3.5 h-3.5 text-[#16A34A] shrink-0" />
                        )}
                        {chk.status === 'missing' && (
                          <XCircle className="w-3.5 h-3.5 text-[#DC2626] shrink-0" />
                        )}
                        {(chk.status === 'warning' || chk.status === 'untested') && (
                          <ShieldAlert className="w-3.5 h-3.5 text-[#D97706] shrink-0" />
                        )}
                        <span>{chk.label}</span>
                      </span>
                      <span
                        className={`text-[10px] font-mono-tabular uppercase ${
                          chk.status === 'ok'
                            ? 'text-[#16A34A]'
                            : chk.status === 'missing'
                            ? 'text-[#DC2626]'
                            : 'text-[#D97706]'
                        }`}
                      >
                        {chk.status}
                      </span>
                    </div>
                    <div className="font-mono-tabular text-[11px] text-[#49504B] break-all">
                      {chk.value}
                    </div>
                    <div className="text-[11px] text-[#5C635E]">{chk.detail}</div>
                  </div>
                ))}
              </div>

              <div className="p-3 rounded-md border border-[#E6E0D6] bg-[#FAF8F4] space-y-2 text-[11px]">
                <div className="font-semibold text-[#1D221F]">
                  Exact Redirect URIs for Google Cloud Console
                </div>
                {diagData.expectedRedirectUris.map((uri) => (
                  <div
                    key={uri}
                    className="flex items-center justify-between gap-2 bg-white border border-[#E6E0D6] rounded px-2.5 py-1.5"
                  >
                    <span className="font-mono-tabular text-[#1B4332] truncate">{uri}</span>
                    <button
                      type="button"
                      onClick={() => handleCopy(uri)}
                      className="text-[#5C635E] hover:text-[#1B4332] shrink-0 flex items-center gap-1 cursor-pointer"
                    >
                      <Copy className="w-3 h-3" />
                      <span>{copiedUri === uri ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* 3. Administrator Activity Audit Log */}
      <div className="bg-white border border-[#E6E0D6] rounded-lg p-6">
        <h2 className="font-display text-xl font-bold text-[#1D221F] mb-3">
          Activity &amp; Publishing Audit Log
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[#E6E0D6] text-[#5C635E]">
                <th className="text-left py-2 font-medium">Timestamp</th>
                <th className="text-left py-2 font-medium">Module</th>
                <th className="text-left py-2 font-medium">Action</th>
                <th className="text-left py-2 font-medium">Details</th>
                <th className="text-left py-2 font-medium">Actor</th>
              </tr>
            </thead>
            <tbody>
              {profile.recentActivity.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-[#5C635E]">
                    No activity logged yet.
                  </td>
                </tr>
              ) : (
                profile.recentActivity.map((act) => (
                  <tr key={act.id} className="border-b border-[#F0ECE4]">
                    <td className="py-2 pr-3 font-mono-tabular text-[#5C635E] whitespace-nowrap">
                      {new Date(act.createdAt).toLocaleString()}
                    </td>
                    <td className="py-2 pr-3 font-medium text-[#1B4332]">{act.module}</td>
                    <td className="py-2 pr-3 text-[#1D221F]">{act.action}</td>
                    <td className="py-2 pr-3 text-[#49504B]">{act.details}</td>
                    <td className="py-2 font-mono-tabular text-[#5C635E]">{act.actorEmail}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
