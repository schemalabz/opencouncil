'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { AlertCircle, Users, Building2, UserCheck, Save, Loader2, Sparkles } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';

interface CityCreatorProps {
    cityId: string;
    cityName: string;
    onSuccess?: () => void;
    onCancel?: () => void;
}

interface PersonRole {
    type: 'party' | 'city' | 'adminBody';
    name: string;
    name_en: string;
    isHead?: boolean;
    partyName?: string;
    administrativeBodyName?: string;
}

interface CityData {
    cityId: string;
    parties: Array<{
        name: string;
        name_en: string;
        name_short: string;
        name_short_en: string;
        colorHex: string;
        logo?: string;
    }>;
    administrativeBodies: Array<{
        name: string;
        name_en: string;
        type: 'council' | 'committee' | 'community';
    }>;
    people: Array<{
        name: string;
        name_en: string;
        name_short: string;
        name_short_en: string;
        image?: string;
        activeFrom?: string;
        activeTo?: string;
        profileUrl?: string;
        roles?: PersonRole[];
    }>;
}

export default function CityCreator({ cityId, cityName, onSuccess, onCancel }: CityCreatorProps) {
    const [cityData, setCityData] = useState<CityData | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [aiLoading, setAiLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const { toast } = useToast();

    // Load initial data
    useEffect(() => {
        const loadData = async () => {
            try {
                const response = await fetch(`/api/cities/${cityId}/populate`);
                if (!response.ok) {
                    throw new Error('Failed to load city data');
                }
                const data = await response.json();
                setCityData(data);
            } catch (err) {
                setError('Failed to load city data');
                console.error('Error loading city data:', err);
            } finally {
                setLoading(false);
            }
        };

        loadData();
    }, [cityId]);

    // Handle AI import
    const handleAiImport = async () => {
        setAiLoading(true);
        setError(null);

        try {
            const response = await fetch(`/api/cities/${cityId}/populate/ai`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to generate AI data');
            }

            const result = await response.json();

            if (result.success && result.data) {
                setCityData(result.data);
                toast({
                    title: 'Success',
                    description: 'AI data generation completed successfully',
                });
            } else {
                throw new Error('Invalid response from AI service');
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to generate AI data');
            toast({
                title: 'Error',
                description: 'Failed to generate AI data',
                variant: 'destructive',
            });
        } finally {
            setAiLoading(false);
        }
    };

    // Handle save
    const handleSave = async () => {
        if (!cityData) return;

        setSaving(true);
        setError(null);

        try {
            const response = await fetch(`/api/cities/${cityId}/populate`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(cityData),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to save city data');
            }

            const result = await response.json();
            toast({
                title: 'Success',
                description: 'City data saved successfully',
            });

            if (onSuccess) {
                onSuccess();
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to save city data');
            toast({
                title: 'Error',
                description: 'Failed to save city data',
                variant: 'destructive',
            });
        } finally {
            setSaving(false);
        }
    };

    // Add new items
    const addParty = () => {
        if (!cityData) return;
        setCityData({
            ...cityData,
            parties: [...cityData.parties, {
                name: '',
                name_en: '',
                name_short: '',
                name_short_en: '',
                colorHex: '#000000',
            }],
        });
    };

    const addPerson = () => {
        if (!cityData) return;
        setCityData({
            ...cityData,
            people: [...cityData.people, {
                name: '',
                name_en: '',
                name_short: '',
                name_short_en: '',
                image: '',
                activeFrom: '',
                activeTo: '',
                profileUrl: '',
                roles: []
            }],
        });
    };

    const addPersonRole = (personIndex: number, roleType: 'party' | 'city' | 'adminBody') => {
        if (!cityData) return;
        const updated = [...cityData.people];
        if (!updated[personIndex].roles) {
            updated[personIndex].roles = [];
        }
        updated[personIndex].roles!.push({
            type: roleType,
            name: '',
            name_en: '',
            isHead: false,
        });
        setCityData({ ...cityData, people: updated });
    };

    const addAdministrativeBody = () => {
        if (!cityData) return;
        setCityData({
            ...cityData,
            administrativeBodies: [...cityData.administrativeBodies, {
                name: '',
                name_en: '',
                type: 'committee',
            }],
        });
    };

    // Remove items
    const removeParty = (index: number) => {
        if (!cityData) return;
        setCityData({
            ...cityData,
            parties: cityData.parties.filter((_, i) => i !== index),
        });
    };

    const removePerson = (index: number) => {
        if (!cityData) return;
        setCityData({
            ...cityData,
            people: cityData.people.filter((_, i) => i !== index),
        });
    };

    const removePersonRole = (personIndex: number, roleIndex: number) => {
        if (!cityData) return;
        const updated = [...cityData.people];
        if (updated[personIndex].roles) {
            updated[personIndex].roles = updated[personIndex].roles!.filter((_, i) => i !== roleIndex);
        }
        setCityData({ ...cityData, people: updated });
    };

    const removeAdministrativeBody = (index: number) => {
        if (!cityData) return;
        setCityData({
            ...cityData,
            administrativeBodies: cityData.administrativeBodies.filter((_, i) => i !== index),
        });
    };

    // Update items
    const updateParty = (index: number, field: string, value: string) => {
        if (!cityData) return;
        const updated = [...cityData.parties];
        updated[index] = { ...updated[index], [field]: value };
        setCityData({ ...cityData, parties: updated });
    };

    const updatePerson = (index: number, field: string, value: string | boolean) => {
        if (!cityData) return;
        const updated = [...cityData.people];
        updated[index] = { ...updated[index], [field]: value };
        setCityData({ ...cityData, people: updated });
    };

    const updatePersonRole = (personIndex: number, roleIndex: number, field: string, value: string | boolean) => {
        if (!cityData) return;
        const updated = [...cityData.people];
        if (updated[personIndex].roles) {
            updated[personIndex].roles![roleIndex] = {
                ...updated[personIndex].roles![roleIndex],
                [field]: value
            };
        }
        setCityData({ ...cityData, people: updated });
    };

    const updateAdministrativeBody = (index: number, field: string, value: string) => {
        if (!cityData) return;
        const updated = [...cityData.administrativeBodies];
        updated[index] = { ...updated[index], [field]: value };
        setCityData({ ...cityData, administrativeBodies: updated });
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-8">
                <Loader2 className="w-8 h-8 animate-spin" />
                <span className="ml-2">Loading city data...</span>
            </div>
        );
    }

    // Check if form should be disabled
    const isFormDisabled = aiLoading || saving;

    if (!cityData) {
        return (
            <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                    Failed to load city data. Please try again.
                </AlertDescription>
            </Alert>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold">City Creator</h1>
                    <p className="text-muted-foreground">Populate data for {cityName}</p>
                    {aiLoading && (
                        <p className="text-sm text-blue-600 mt-1">
                            🤖 AI is searching the web for data and generating content...
                        </p>
                    )}
                </div>
                <div className="flex gap-2">
                    {onCancel && (
                        <Button variant="outline" onClick={onCancel} disabled={isFormDisabled}>
                            Cancel
                        </Button>
                    )}
                    <Button variant="outline" onClick={handleAiImport} disabled={isFormDisabled}>
                        {aiLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Sparkles className="w-4 h-4 mr-2" />}
                        Import with AI
                    </Button>
                    <Button onClick={handleSave} disabled={isFormDisabled}>
                        {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                        Save & Activate
                    </Button>
                </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Political Parties</CardTitle>
                        <Building2 className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{cityData.parties.length}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Council Members</CardTitle>
                        <Users className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{cityData.people.length}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Roles</CardTitle>
                        <UserCheck className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            {cityData.people.reduce((count, person) => count + (person.roles?.length || 0), 0)}
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Administrative Bodies</CardTitle>
                        <Building2 className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{cityData.administrativeBodies.length}</div>
                    </CardContent>
                </Card>
            </div>

            {/* Error Alert */}
            {error && (
                <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            )}

            {/* Tabs for different sections */}
            <div className="relative">
                {aiLoading && (
                    <div className="absolute inset-0 bg-background/50 backdrop-blur-sm z-10 rounded-lg flex items-center justify-center">
                        <div className="bg-background border rounded-lg p-6 shadow-lg text-center">
                            <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-blue-600" />
                            <h3 className="text-lg font-semibold mb-2">AI Processing</h3>
                            <p className="text-muted-foreground">
                                Generating municipal data with AI.<br />
                                This may take a few minutes...
                            </p>
                        </div>
                    </div>
                )}
                <Tabs defaultValue="parties" className="w-full">
                    <TabsList className="grid w-full grid-cols-3">
                        <TabsTrigger value="parties">Parties</TabsTrigger>
                        <TabsTrigger value="people">People</TabsTrigger>
                        <TabsTrigger value="admin-bodies">Admin Bodies</TabsTrigger>
                    </TabsList>

                    <TabsContent value="parties" className="space-y-4">
                        <div className="flex justify-between items-center">
                            <h3 className="text-lg font-semibold">Political Parties</h3>
                            <Button onClick={addParty} disabled={isFormDisabled}>Add Party</Button>
                        </div>
                        {cityData.parties.map((party, index) => (
                            <Card key={index}>
                                <CardHeader>
                                    <div className="flex justify-between items-center">
                                        <CardTitle className="text-base">Party {index + 1}</CardTitle>
                                        <Button variant="destructive" size="sm" onClick={() => removeParty(index)} disabled={isFormDisabled}>
                                            Remove
                                        </Button>
                                    </div>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <Label htmlFor={`party-${index}-name`}>Name (Greek)</Label>
                                            <Input
                                                id={`party-${index}-name`}
                                                value={party.name}
                                                onChange={(e) => updateParty(index, 'name', e.target.value)}
                                                placeholder="e.g., Δημοτική Παράταξη"
                                                disabled={isFormDisabled}
                                            />
                                        </div>
                                        <div>
                                            <Label htmlFor={`party-${index}-name-en`}>Name (English)</Label>
                                            <Input
                                                id={`party-${index}-name-en`}
                                                value={party.name_en}
                                                onChange={(e) => updateParty(index, 'name_en', e.target.value)}
                                                placeholder="e.g., Municipal Coalition"
                                                disabled={isFormDisabled}
                                            />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <Label htmlFor={`party-${index}-short`}>Short Name (Greek)</Label>
                                            <Input
                                                id={`party-${index}-short`}
                                                value={party.name_short}
                                                onChange={(e) => updateParty(index, 'name_short', e.target.value)}
                                                placeholder="e.g., Δ.Π."
                                            />
                                        </div>
                                        <div>
                                            <Label htmlFor={`party-${index}-short-en`}>Short Name (English)</Label>
                                            <Input
                                                id={`party-${index}-short-en`}
                                                value={party.name_short_en}
                                                onChange={(e) => updateParty(index, 'name_short_en', e.target.value)}
                                                placeholder="e.g., M.C."
                                            />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <Label htmlFor={`party-${index}-color`}>Color</Label>
                                            <Input
                                                id={`party-${index}-color`}
                                                type="color"
                                                value={party.colorHex}
                                                onChange={(e) => updateParty(index, 'colorHex', e.target.value)}
                                                disabled={isFormDisabled}
                                            />
                                        </div>
                                        <div>
                                            <Label htmlFor={`party-${index}-logo`}>Logo URL (Optional)</Label>
                                            <Input
                                                id={`party-${index}-logo`}
                                                value={party.logo || ''}
                                                onChange={(e) => updateParty(index, 'logo', e.target.value)}
                                                placeholder="https://example.com/logo.png"
                                            />
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                        {cityData.parties.length === 0 && (
                            <p className="text-center text-muted-foreground py-8">No parties added yet. Click "Add Party" to get started.</p>
                        )}
                    </TabsContent>

                    <TabsContent value="people" className="space-y-4">
                        <div className="flex justify-between items-center">
                            <h3 className="text-lg font-semibold">People</h3>
                            <Button onClick={addPerson} disabled={isFormDisabled}>Add Person</Button>
                        </div>
                        {cityData.people.map((person, index) => (
                            <Card key={index}>
                                <CardHeader>
                                    <div className="flex justify-between items-center">
                                        <CardTitle className="text-base">Person {index + 1}</CardTitle>
                                        <Button variant="destructive" size="sm" onClick={() => removePerson(index)} disabled={isFormDisabled}>
                                            Remove
                                        </Button>
                                    </div>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <Label htmlFor={`person-${index}-name`}>Name (Greek)</Label>
                                            <Input
                                                id={`person-${index}-name`}
                                                value={person.name}
                                                onChange={(e) => updatePerson(index, 'name', e.target.value)}
                                                placeholder="e.g., Γιάννης Παπαδόπουλος"
                                            />
                                        </div>
                                        <div>
                                            <Label htmlFor={`person-${index}-name-en`}>Name (English)</Label>
                                            <Input
                                                id={`person-${index}-name-en`}
                                                value={person.name_en}
                                                onChange={(e) => updatePerson(index, 'name_en', e.target.value)}
                                                placeholder="e.g., John Papadopoulos"
                                            />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <Label htmlFor={`person-${index}-short`}>Short Name (Greek)</Label>
                                            <Input
                                                id={`person-${index}-short`}
                                                value={person.name_short}
                                                onChange={(e) => updatePerson(index, 'name_short', e.target.value)}
                                                placeholder="e.g., Γ. Παπαδόπουλος"
                                            />
                                        </div>
                                        <div>
                                            <Label htmlFor={`person-${index}-short-en`}>Short Name (English)</Label>
                                            <Input
                                                id={`person-${index}-short-en`}
                                                value={person.name_short_en}
                                                onChange={(e) => updatePerson(index, 'name_short_en', e.target.value)}
                                                placeholder="e.g., J. Papadopoulos"
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <Label htmlFor={`person-${index}-image`}>Image URL (Optional)</Label>
                                        <Input
                                            id={`person-${index}-image`}
                                            value={person.image || ''}
                                            onChange={(e) => updatePerson(index, 'image', e.target.value)}
                                            placeholder="https://example.com/photo.jpg"
                                            disabled={isFormDisabled}
                                        />
                                    </div>

                                    {/* Roles Section */}
                                    <div className="space-y-3">
                                        <div className="flex items-center justify-between">
                                            <Label className="text-sm font-medium">Roles</Label>
                                            <div className="flex gap-1">
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={() => addPersonRole(index, 'party')}
                                                    disabled={isFormDisabled}
                                                    className="h-7 px-2 text-xs"
                                                >
                                                    +Party
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={() => addPersonRole(index, 'city')}
                                                    disabled={isFormDisabled}
                                                    className="h-7 px-2 text-xs"
                                                >
                                                    +City
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={() => addPersonRole(index, 'adminBody')}
                                                    disabled={isFormDisabled}
                                                    className="h-7 px-2 text-xs"
                                                >
                                                    +Body
                                                </Button>
                                            </div>
                                        </div>

                                        {person.roles && person.roles.length > 0 && (
                                            <div className="space-y-2">
                                                {person.roles.map((role, roleIndex) => (
                                                    <div key={roleIndex} className="flex items-center gap-2 p-2 border rounded text-sm">
                                                        <Badge variant={role.type === 'party' ? 'default' : role.type === 'city' ? 'secondary' : 'outline'}>
                                                            {role.type === 'party' ? 'Party' : role.type === 'city' ? 'City' : 'Body'}
                                                        </Badge>

                                                        <Input
                                                            value={role.name}
                                                            onChange={(e) => updatePersonRole(index, roleIndex, 'name', e.target.value)}
                                                            placeholder="Role name"
                                                            className="h-7 flex-1"
                                                            disabled={isFormDisabled}
                                                        />

                                                        {role.type === 'party' && (
                                                            <Select
                                                                value={role.partyName || 'none'}
                                                                onValueChange={(value) => updatePersonRole(index, roleIndex, 'partyName', value === 'none' ? '' : value)}
                                                                disabled={isFormDisabled}
                                                            >
                                                                <SelectTrigger className="h-7 w-24">
                                                                    <SelectValue />
                                                                </SelectTrigger>
                                                                <SelectContent>
                                                                    <SelectItem value="none">None</SelectItem>
                                                                    {cityData.parties.map((party) => (
                                                                        <SelectItem key={party.name} value={party.name}>
                                                                            {party.name_short}
                                                                        </SelectItem>
                                                                    ))}
                                                                </SelectContent>
                                                            </Select>
                                                        )}

                                                        {role.type === 'adminBody' && (
                                                            <Select
                                                                value={role.administrativeBodyName || 'none'}
                                                                onValueChange={(value) => updatePersonRole(index, roleIndex, 'administrativeBodyName', value === 'none' ? '' : value)}
                                                                disabled={isFormDisabled}
                                                            >
                                                                <SelectTrigger className="h-7 w-24">
                                                                    <SelectValue />
                                                                </SelectTrigger>
                                                                <SelectContent>
                                                                    <SelectItem value="none">None</SelectItem>
                                                                    {cityData.administrativeBodies.map((body) => (
                                                                        <SelectItem key={body.name} value={body.name}>
                                                                            {body.name}
                                                                        </SelectItem>
                                                                    ))}
                                                                </SelectContent>
                                                            </Select>
                                                        )}

                                                        <Switch
                                                            checked={role.isHead || false}
                                                            onCheckedChange={(checked) => updatePersonRole(index, roleIndex, 'isHead', checked)}
                                                            disabled={isFormDisabled}
                                                        />
                                                        <Label className="text-xs">Head</Label>

                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={() => removePersonRole(index, roleIndex)}
                                                            disabled={isFormDisabled}
                                                            className="h-7 w-7 p-0"
                                                        >
                                                            ×
                                                        </Button>
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                        {(!person.roles || person.roles.length === 0) && (
                                            <p className="text-xs text-muted-foreground">No roles assigned</p>
                                        )}
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                        {cityData.people.length === 0 && (
                            <p className="text-center text-muted-foreground py-8">No people added yet. Click "Add Person" to get started.</p>
                        )}
                    </TabsContent>



                    <TabsContent value="admin-bodies" className="space-y-4">
                        <div className="flex justify-between items-center">
                            <h3 className="text-lg font-semibold">Administrative Bodies</h3>
                            <Button onClick={addAdministrativeBody} disabled={isFormDisabled}>Add Administrative Body</Button>
                        </div>
                        {cityData.administrativeBodies.map((body, index) => (
                            <Card key={index}>
                                <CardHeader>
                                    <div className="flex justify-between items-center">
                                        <CardTitle className="text-base">Administrative Body {index + 1}</CardTitle>
                                        <Button variant="destructive" size="sm" onClick={() => removeAdministrativeBody(index)} disabled={isFormDisabled}>
                                            Remove
                                        </Button>
                                    </div>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <Label htmlFor={`body-${index}-name`}>Name (Greek)</Label>
                                            <Input
                                                id={`body-${index}-name`}
                                                value={body.name}
                                                onChange={(e) => updateAdministrativeBody(index, 'name', e.target.value)}
                                                placeholder="e.g., Δημοτικό Συμβούλιο"
                                            />
                                        </div>
                                        <div>
                                            <Label htmlFor={`body-${index}-name-en`}>Name (English)</Label>
                                            <Input
                                                id={`body-${index}-name-en`}
                                                value={body.name_en}
                                                onChange={(e) => updateAdministrativeBody(index, 'name_en', e.target.value)}
                                                placeholder="e.g., Municipal Council"
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <Label htmlFor={`body-${index}-type`}>Type</Label>
                                        <Select
                                            value={body.type}
                                            onValueChange={(value) => updateAdministrativeBody(index, 'type', value)}
                                        >
                                            <SelectTrigger>
                                                <SelectValue placeholder="Select type" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="council">Council</SelectItem>
                                                <SelectItem value="committee">Committee</SelectItem>
                                                <SelectItem value="community">Community</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                        {cityData.administrativeBodies.length === 0 && (
                            <p className="text-center text-muted-foreground py-8">No administrative bodies added yet. Click "Add Administrative Body" to get started.</p>
                        )}
                    </TabsContent>
                </Tabs>
            </div>
        </div>
    );
} 