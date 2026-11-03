import React, { useState } from 'react';
import { 
  X, 
  MapPin, 
  Navigation, 
  Plus, 
  Send, 
  Trash2, 
  ChevronUp, 
  ChevronDown, 
  Building2, 
  ExternalLink 
} from 'lucide-react';
import { QuickLocationPreset } from '../../types/whatsapp';

interface LocationPickerModalProps {
  isOpen: boolean;
  locations: QuickLocationPreset[];
  onClose: () => void;
  onSendLocation: (loc: { latitude: number; longitude: number; name: string; address: string }) => void;
  onAddLocation: (loc: Omit<QuickLocationPreset, 'id' | 'orderIndex'>) => void;
  onDeleteLocation: (id: string) => void;
  onReorderLocations: (fromIndex: number, toIndex: number) => void;
}

export const LocationPickerModal: React.FC<LocationPickerModalProps> = ({
  isOpen,
  locations,
  onClose,
  onSendLocation,
  onAddLocation,
  onDeleteLocation,
  onReorderLocations
}) => {
  const [showAddForm, setShowAddForm] = useState(false);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [lat, setLat] = useState('37.7891');
  const [lng, setLng] = useState('-122.3993');
  const [isGettingGps, setIsGettingGps] = useState(false);

  if (!isOpen) return null;

  // Share Live GPS
  const handleShareCurrentGps = () => {
    setIsGettingGps(true);
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setIsGettingGps(false);
          onSendLocation({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            name: 'Live GPS Location',
            address: `Lat: ${pos.coords.latitude.toFixed(4)}, Lng: ${pos.coords.longitude.toFixed(4)}`
          });
          onClose();
        },
        () => {
          setIsGettingGps(false);
          // Fallback
          onSendLocation({
            latitude: 37.7749,
            longitude: -122.4194,
            name: 'Current Office Location',
            address: 'Downtown Hub, San Francisco, CA'
          });
          onClose();
        },
        { enableHighAccuracy: true, timeout: 6000 }
      );
    } else {
      setIsGettingGps(false);
      onSendLocation({
        latitude: 37.7749,
        longitude: -122.4194,
        name: 'Current Office Location',
        address: 'Downtown Hub, San Francisco, CA'
      });
      onClose();
    }
  };

  const handleCreateLocation = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !address.trim()) return;

    onAddLocation({
      name: name.trim(),
      address: address.trim(),
      latitude: parseFloat(lat) || 37.7749,
      longitude: parseFloat(lng) || -122.4194
    });

    setName('');
    setAddress('');
    setShowAddForm(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3 animate-in fade-in select-none">
      <div className="w-full max-w-lg bg-white dark:bg-[#1F2C34] rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col max-h-[88vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#182229] shrink-0">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <MapPin className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span>Share Location &amp; Branch Offices</span>
            </h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              Live device GPS or pre-saved office centers in the city ({locations.length}/10)
            </p>
          </div>

          <button
            onClick={onClose}
            className="p-1 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Live GPS CTA Button */}
        <div className="p-3 border-b border-slate-100 dark:border-slate-800 bg-emerald-50/50 dark:bg-emerald-950/20 shrink-0">
          <button
            onClick={handleShareCurrentGps}
            disabled={isGettingGps}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-sm active:scale-95 transition-all"
          >
            <Navigation className={`w-4 h-4 ${isGettingGps ? 'animate-spin' : ''}`} />
            <span>{isGettingGps ? 'Acquiring GPS...' : 'Share Live GPS Current Location'}</span>
          </button>
        </div>

        {/* Branch Offices Section */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-slate-100 dark:border-slate-800 shrink-0 bg-white dark:bg-[#1F2C34]">
          <span className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
            <Building2 className="w-3.5 h-3.5 text-[#008069]" />
            <span>Multi-Office &amp; Centers List</span>
          </span>

          <button
            onClick={() => setShowAddForm(!showAddForm)}
            disabled={locations.length >= 10}
            className="flex items-center gap-1 text-xs font-semibold text-[#008069] dark:text-[#25D366] hover:underline"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{showAddForm ? 'Cancel' : '+ Add Branch Office'}</span>
          </button>
        </div>

        {/* Add Branch Form */}
        {showAddForm && (
          <form onSubmit={handleCreateLocation} className="p-3 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 space-y-2 text-xs">
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-0.5">
                Office / Branch Name
              </label>
              <input
                type="text"
                required
                placeholder="e.g. West Coast Fulfillment Center"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-0.5">
                Physical Address
              </label>
              <input
                type="text"
                required
                placeholder="e.g. 1400 Industrial Way, Gate 3, City"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="w-full px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-0.5">
                  Latitude
                </label>
                <input
                  type="text"
                  placeholder="37.7891"
                  value={lat}
                  onChange={(e) => setLat(e.target.value)}
                  className="w-full px-3 py-1.5 font-mono text-[11px] rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-0.5">
                  Longitude
                </label>
                <input
                  type="text"
                  placeholder="-122.3993"
                  value={lng}
                  onChange={(e) => setLng(e.target.value)}
                  className="w-full px-3 py-1.5 font-mono text-[11px] rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="px-3 py-1 font-semibold rounded-lg text-slate-600 hover:bg-slate-200"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-1 font-semibold rounded-lg bg-[#008069] text-white hover:opacity-90"
              >
                Save Branch
              </button>
            </div>
          </form>
        )}

        {/* Saved Branch Locations List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {locations.map((loc, idx) => (
            <div
              key={loc.id}
              className="flex items-center gap-2.5 p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 hover:border-[#008069] transition-all"
            >
              <div className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                <Building2 className="w-5 h-5" />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold text-slate-900 dark:text-white truncate">
                    {loc.name}
                  </span>
                  <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-md bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 shrink-0">
                    #{idx + 1}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                  {loc.address}
                </p>
                <div className="flex items-center gap-2 text-[10px] text-slate-400 font-mono mt-0.5">
                  <span>Lat: {loc.latitude}</span>
                  <span>·</span>
                  <span>Lng: {loc.longitude}</span>
                </div>
              </div>

              {/* Reorder controls */}
              <div className="flex flex-col items-center shrink-0">
                <button
                  onClick={() => onReorderLocations(idx, idx - 1)}
                  disabled={idx === 0}
                  className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-20"
                  title="Move Up"
                >
                  <ChevronUp className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => onReorderLocations(idx, idx + 1)}
                  disabled={idx === locations.length - 1}
                  className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-20"
                  title="Move Down"
                >
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Delete button */}
              {locations.length > 1 && (
                <button
                  onClick={() => {
                    if (confirm(`Remove office branch "${loc.name}"?`)) {
                      onDeleteLocation(loc.id);
                    }
                  }}
                  className="p-1.5 text-slate-400 hover:text-red-500 transition-colors shrink-0"
                  title="Delete branch"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}

              {/* Send Location Button */}
              <button
                onClick={() => {
                  onSendLocation({
                    latitude: loc.latitude,
                    longitude: loc.longitude,
                    name: loc.name,
                    address: loc.address
                  });
                  onClose();
                }}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#008069] dark:bg-[#25D366] text-white text-xs font-semibold hover:opacity-95 active:scale-95 transition-all shadow-xs shrink-0"
                title="Send this office location"
              >
                <Send className="w-3 h-3" />
                <span>Send</span>
              </button>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 bg-slate-50 dark:bg-[#182229] border-t border-slate-200 dark:border-slate-800 text-[11px] text-slate-500 flex justify-between items-center shrink-0">
          <span>Multiple centers in city supported</span>
          <button onClick={onClose} className="font-semibold text-slate-600 dark:text-slate-300 hover:underline">
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
