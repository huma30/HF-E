import React, { useEffect, useState } from 'react';
import { AuditLog } from '../../types';
import { FirestoreService } from '../../services/firestoreService';
import { Shield, Clock, UserCheck } from 'lucide-react';

export const AdminAuditLogs: React.FC = () => {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchLogs = async () => {
      try {
        const data = await FirestoreService.getAuditLogs();
        setLogs(data);
      } catch (err) {
        console.error('Failed to load audit logs', err);
      } finally {
        setLoading(false);
      }
    };
    fetchLogs();
  }, []);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-heading font-extrabold text-xl text-[#2E1A47]">
          Audit Log & Riwayat Aktivitas
        </h2>
        <p className="text-xs text-gray-500 mt-0.5">
          Pencatatan aktivitas sensitif staff (Super Admin, Admin, Kasir)
        </p>
      </div>

      <div className="clay-card p-4">
        {loading ? (
          <p className="text-xs text-gray-400 py-6 text-center">Memuat catatan log...</p>
        ) : logs.length === 0 ? (
          <div className="py-8 text-center text-gray-400">
            <Shield className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-xs font-semibold">Belum ada riwayat aktivitas yang tercatat.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {logs.map((log) => (
              <div
                key={log.id}
                className="p-3 bg-gray-50 rounded-xl border border-gray-100 flex items-center justify-between text-xs"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-purple-100 text-[#2E1A47] flex items-center justify-center font-bold text-xs">
                    {log.actorRole.substring(0, 2)}
                  </div>
                  <div>
                    <p className="font-bold text-gray-900">
                      {log.action} • <span className="text-gray-500 font-normal">{log.targetType}</span>
                    </p>
                    <p className="text-[11px] text-gray-400">
                      Oleh: {log.actorId} ({log.actorRole})
                    </p>
                  </div>
                </div>

                <span className="text-[11px] text-gray-400 font-mono">
                  {new Date(log.timestamp).toLocaleString('id-ID')}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
