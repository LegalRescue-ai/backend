/* eslint-disable prettier/prettier */

export interface FilterOptions {
  timeFrame?: string;
  practiceArea?: string;
  county?: string;
  zipCode?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { CaseStatus } from 'src/casesubmission/dto/createcase.dto';
import { SupabaseService } from 'src/supabase/supabase.service';
import { CaseInterest } from './entities';

@Injectable()
export class CaseManagementService {
  private supabaseClient: SupabaseClient;
  
  constructor(private readonly supabaseService: SupabaseService) {
    this.supabaseClient = supabaseService.getClient();
    console.log('[CaseManagementService] Initialized');
  }

  async getAvailableCases(attorneyId: string, filters: FilterOptions) {
    console.log(`[getAvailableCases] Started for attorneyId: ${attorneyId} with filters:`, JSON.stringify(filters, null, 2));
    
    // Fetch attorney data
    const { data: attorneyData, error: attorneyError } = await this.supabaseClient
      .from('attorneys')
      .select('countiesSubscribed, zipCodesSubscribed, areasOfPractice')
      .eq('id', attorneyId)
      .single();
  
    if (attorneyError || !attorneyData) {
      console.error('[getAvailableCases] Attorney fetch error:', attorneyError);
      console.log('[getAvailableCases] Attorney data:', attorneyData);
      throw new NotFoundException('Attorney not found');
    }

    console.log(`[getAvailableCases] Found attorney with id: ${attorneyId}`);
    console.log('[getAvailableCases] Attorney counties:', JSON.stringify(attorneyData.countiesSubscribed, null, 2));
    console.log('[getAvailableCases] Attorney zip codes:', JSON.stringify(attorneyData.zipCodesSubscribed, null, 2));
    console.log('[getAvailableCases] Attorney practice areas:', JSON.stringify(attorneyData.areasOfPractice, null, 2));
  
    // Get retained cases
    const { data: retainedCases, error: retainedError } = await this.supabaseClient
      .from('case_interests')
      .select('case_id')
      .eq('status', CaseStatus.RETAINED);
    
    if (retainedError) {
      console.error('[getAvailableCases] Error fetching retained cases:', retainedError);
    }
    
    console.log(`[getAvailableCases] Found ${retainedCases?.length || 0} retained cases`);
  
    // Get attorney's interested cases
    const { data: interestedCases, error: interestedError } = await this.supabaseClient
      .from('case_interests')
      .select('case_id')
      .eq('attorney_id', attorneyId);
    
    if (interestedError) {
      console.error('[getAvailableCases] Error fetching interested cases:', interestedError);
    }
    
    console.log(`[getAvailableCases] Found ${interestedCases?.length || 0} interested cases for attorney`);
  
    // Build exclusion list
    const casesToExclude = [
      ...(retainedCases?.map(c => c.case_id) || []),
      ...(interestedCases?.map(i => i.case_id) || [])
    ];
    
    console.log(`[getAvailableCases] Total cases to exclude: ${casesToExclude.length}`);
    if (casesToExclude.length > 0) {
      console.log('[getAvailableCases] Cases to exclude:', JSON.stringify(casesToExclude, null, 2));
    }
  
    // Start building query
    let query = this.supabaseClient
      .from('cases')
      .select(`
        id,
        created_at,
        legal_category,
        aigeneratedsummary
      `);

    // Apply exclusions
    if (casesToExclude.length > 0) {
      query = query.not('id', 'in', `(${casesToExclude})`);
      console.log('[getAvailableCases] Applied exclusion filter');
    }
  
    // Apply practice area filter
    console.log('[getAvailableCases] Filtering by attorney practice areas:', JSON.stringify(attorneyData.areasOfPractice, null, 2));
    query = query.in('legal_category', attorneyData.areasOfPractice);
  
    // Apply location filters
    console.log('[getAvailableCases] Applying location filters');
    query = this.applyLocationFilters(query, attorneyData, filters);
    
    // Apply time frame filter
    if (filters.timeFrame) {
      console.log(`[getAvailableCases] Applying time frame filter: ${filters.timeFrame}`);
      query = this.applyTimeFrameFilter(query, filters.timeFrame);
    }
    
    // Apply practice area filter if specified
    if (filters.practiceArea) {
      console.log(`[getAvailableCases] Filtering by specific practice area: ${filters.practiceArea}`);
      query = query.eq('legal_category', filters.practiceArea);
    }
  
    // Apply sorting
    if (filters.sortBy) {
      console.log(`[getAvailableCases] Sorting by ${filters.sortBy} ${filters.sortOrder || 'desc'}`);
      query = query.order(filters.sortBy, { ascending: filters.sortOrder === 'asc' });
    } else {
      console.log('[getAvailableCases] Using default sort: created_at desc');
      query = query.order('created_at', { ascending: false });
    }
  
    // Execute query
    const { data: cases, error } = await query;
    
    if (error) {
      console.error('[getAvailableCases] Error executing query:', error);
      throw new Error(`Error fetching cases: ${error.message}`);
    }
    
    console.log(`[getAvailableCases] Successfully fetched ${cases?.length || 0} available cases`);
    return cases;
  }

  async getInterestedCases(attorneyId: string, filters: FilterOptions) {
    console.log(`[getInterestedCases] Started for attorneyId: ${attorneyId} with filters:`, JSON.stringify(filters, null, 2));
    
    // Get retained cases
    const { data: retainedCases, error: retainedError } = await this.supabaseClient
      .from('case_interests')
      .select('case_id, attorney_id')
      .eq('status', CaseStatus.RETAINED);

    if (retainedError) {
      console.error('[getInterestedCases] Error fetching retained cases:', retainedError);
    }
    
    console.log(`[getInterestedCases] Found ${retainedCases?.length || 0} retained cases total`);

    // Create map of retained cases
    const retainedCaseMap = new Map(
      retainedCases?.map(c => [c.case_id, c.attorney_id]) || []
    );
    
    console.log(`[getInterestedCases] Created retained case map with ${retainedCaseMap.size} entries`);

    // Build query for attorney's interested cases
    let query = this.supabaseClient
      .from('case_interests')
      .select(`
        *,
        cases (
          id,
          created_at,
          legal_category,
          aigeneratedsummary,
          county,
          zip,
          enable_conflict_checks,
          questionnaire_responses,
          client_case_summary,

          clients (
            id,
            first_name,
            last_name,
            zip_code
          )
        )
      `)
      .eq('attorney_id', attorneyId);

    if (filters.sortBy) {
      console.log(`[getInterestedCases] Sorting by ${filters.sortBy} ${filters.sortOrder || 'desc'}`);
      query = query.order(filters.sortBy, { ascending: filters.sortOrder === 'asc' });
    }
    
    // Execute query
    const { data, error } = await query;
    
    if (error) {
      console.error('[getInterestedCases] Error executing query:', error);
      throw new Error(`Error fetching interested cases: ${error.message}`);
    }
    
    console.log(`[getInterestedCases] Successfully fetched ${data?.length || 0} interested cases before filtering`);

    // Filter out cases retained by other attorneys and handle client details visibility
    const filteredData = data?.filter(interest => {
      const retainingAttorney = retainedCaseMap.get(interest.case_id);
      if (!retainingAttorney) return true;
      
      const isRetainedByThisAttorney = retainingAttorney === attorneyId;
      console.log(`[getInterestedCases] Case ${interest.case_id} retained status: ${!!retainingAttorney}, retained by this attorney: ${isRetainedByThisAttorney}`);
      
      return isRetainedByThisAttorney;
    }).map(interest => {
      const canViewClientDetails = 
        interest.status === CaseStatus.AWAITING_CLIENT_CONFLICT_CHECK;
      
      console.log(`[getInterestedCases] Case ${interest.case_id} - Can view client details: ${canViewClientDetails}, Status: ${interest.status}`);

      if (canViewClientDetails) {
        console.log(`[getInterestedCases] Removing client details from case ${interest.case_id}`);
        delete interest.cases.clients.first_name;
        delete interest.cases.clients.last_name;
        delete interest.cases.questionnaire_responses;
        delete interest.cases.client_case_summary;
        delete interest.cases.clients.zip_code;
      }

      return interest;
    });

    console.log(`[getInterestedCases] Returning ${filteredData?.length || 0} interested cases after filtering`);
    return filteredData;
  }

  async expressInterest(attorneyId: string, caseId: string): Promise<CaseInterest> {
    console.log(`[expressInterest] Attorney ${attorneyId} expressing interest in case ${caseId}`);
    
    // Check if case is already retained
    const { data: retainedInterest, error: retainedError } = await this.supabaseClient
      .from('case_interests')
      .select('attorney_id')
      .match({ case_id: caseId, status: CaseStatus.RETAINED })
      .single();

    if (retainedError && retainedError.code !== 'PGRST116') {
      console.error('[expressInterest] Error checking for retained interest:', retainedError);
    }

    if (retainedInterest) {
      console.log(`[expressInterest] Case ${caseId} is already retained by attorney ${retainedInterest.attorney_id}`);
      throw new ForbiddenException('Case has already been retained');
    }

    // Check if interest already expressed
    const { data: existingInterest, error: existingError } = await this.supabaseClient
      .from('case_interests')
      .select()
      .match({ attorney_id: attorneyId, case_id: caseId })
      .single();

    if (existingError && existingError.code !== 'PGRST116') {
      console.error('[expressInterest] Error checking for existing interest:', existingError);
    }

    if (existingInterest) {
      console.log(`[expressInterest] Attorney ${attorneyId} already expressed interest in case ${caseId}`);
      throw new ForbiddenException('Interest already expressed');
    }

    // Get case details for conflict check status
    const { data: caseData, error: caseError } = await this.supabaseClient
      .from('cases')
      .select('enable_conflict_checks')
      .eq('id', caseId)
      .single();

    if (caseError) {
      console.error('[expressInterest] Error fetching case details:', caseError);
      throw new NotFoundException('Case not found');
    }

    if (!caseData) {
      console.log(`[expressInterest] Case ${caseId} not found`);
      throw new NotFoundException('Case not found');
    }

    // Determine initial status
    let initialStatus;
    if (caseData.enable_conflict_checks) {
      initialStatus = CaseStatus.AWAITING_CLIENT_CONFLICT_CHECK;
      console.log(`[expressInterest] Case ${caseId} requires client conflict check, setting initial status: ${initialStatus}`);
    } else {
      initialStatus = CaseStatus.AWAITING_ATTORNEY_CONFLICT_CHECK;
      console.log(`[expressInterest] Case ${caseId} doesn't require client conflict check, setting initial status: ${initialStatus}`);
    }

    // Insert interest record
    const { data, error } = await this.supabaseClient
      .from('case_interests')
      .insert({
        attorney_id: attorneyId,
        case_id: caseId,
        status: initialStatus,
        interest_expressed_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) {
      console.error('[expressInterest] Error inserting interest record:', error);
      throw new Error(`Error expressing interest: ${error.message}`);
    }

    console.log(`[expressInterest] Successfully expressed interest, created record with ID: ${data.id}`);
    return data;
  }

  async submitConflictCheck(attorneyId: string, caseId: string) {
    console.log(`[submitConflictCheck] Attorney ${attorneyId} submitting conflict check for case ${caseId}`);
    
    // Get current interest record
    const { data: interest, error: interestError } = await this.supabaseClient
      .from('case_interests')
      .select('status, cases!inner(enable_conflict_checks, id)')
      .match({ attorney_id: attorneyId, case_id: caseId })
      .single();

    if (interestError) {
      console.error('[submitConflictCheck] Error fetching interest record:', interestError);
      throw new NotFoundException('Case interest not found');
    }

    if (!interest) {
      console.log(`[submitConflictCheck] No interest found for attorney ${attorneyId} and case ${caseId}`);
      throw new NotFoundException('Case interest not found');
    }

    console.log(interest.cases);
    

    console.log(`[submitConflictCheck] Found interest record with status: ${interest.status}`);
   

    // Check if case is retained by another attorney
    const { data: retainedInterest, error: retainedError } = await this.supabaseClient
      .from('case_interests')
      .select('attorney_id')
      .match({ case_id: caseId, status: CaseStatus.RETAINED })
      .single();

    if (retainedError && retainedError.code !== 'PGRST116') {
      console.error('[submitConflictCheck] Error checking retained status:', retainedError);
    }

    if (retainedInterest && retainedInterest.attorney_id !== attorneyId) {
      console.log(`[submitConflictCheck] Case ${caseId} is retained by attorney ${retainedInterest.attorney_id}, not ${attorneyId}`);
      throw new ForbiddenException('Case has been retained by another attorney');
    }

    // Update status to completed
    const { data, error } = await this.supabaseClient
      .from('case_interests')
      .update({
        status: CaseStatus.CONFLICT_CHECK_COMPLETED,
      })
      .match({ attorney_id: attorneyId, case_id: caseId })
      .select()
      .single();

    if (error) {
      console.error('[submitConflictCheck] Error updating status:', error);
      throw new Error(`Error submitting conflict check: ${error.message}`);
    }

    console.log(`[submitConflictCheck] Successfully updated status to ${CaseStatus.CONFLICT_CHECK_COMPLETED}`);
    return data;
  }

  async updateCaseStatus(attorneyId: string, caseId: string, newStatus: CaseStatus) {
    console.log(`[updateCaseStatus] Attorney ${attorneyId} updating case ${caseId} to status: ${newStatus}`);
    
    // Get current interest status
    const { data: currentInterest, error: interestError } = await this.supabaseClient
      .from('case_interests')
      .select('status')
      .match({ attorney_id: attorneyId, case_id: caseId })
      .single();

    if (interestError) {
      console.error('[updateCaseStatus] Error fetching current interest:', interestError);
      throw new NotFoundException('Case interest not found');
    }

    if (!currentInterest) {
      console.log(`[updateCaseStatus] No interest found for attorney ${attorneyId} and case ${caseId}`);
      throw new NotFoundException('Case interest not found');
    }

    console.log(`[updateCaseStatus] Current status: ${currentInterest.status}, New status: ${newStatus}`);

    // Validate status transition
    if (!this.isValidStatusTransition(currentInterest.status, newStatus)) {
      console.error(`[updateCaseStatus] Invalid status transition from ${currentInterest.status} to ${newStatus}`);
      throw new ForbiddenException('Invalid status transition');
    }

    // Additional check for RETAINED status
    if (newStatus === CaseStatus.RETAINED) {
      console.log('[updateCaseStatus] Performing additional checks for RETAINED status');
      
      const { data: existingRetained, error: retainedError } = await this.supabaseClient
        .from('case_interests')
        .select('attorney_id')
        .match({ case_id: caseId, status: CaseStatus.RETAINED })
        .single();

      if (retainedError && retainedError.code !== 'PGRST116') {
        console.error('[updateCaseStatus] Error checking for existing retained status:', retainedError);
      }

      if (existingRetained) {
        console.log(`[updateCaseStatus] Case already retained by attorney ${existingRetained.attorney_id}`);
        throw new ForbiddenException('Case has already been retained');
      }

      // Verify conflict check is completed
      if (currentInterest.status !== CaseStatus.CONFLICT_CHECK_COMPLETED &&
          currentInterest.status !== CaseStatus.TERMS_SENT) {
        console.error(`[updateCaseStatus] Cannot retain case before completing conflict check. Current status: ${currentInterest.status}`);
        throw new ForbiddenException('Cannot retain case before completing conflict check');
      }
    }

    // Handle NO_LONGER_INTERESTED status (delete the interest)
    if (newStatus === CaseStatus.NO_LONGER_INTERESTED) {
      console.log(`[updateCaseStatus] Attorney ${attorneyId} no longer interested in case ${caseId}, deleting interest`);
      
      const { error: deletedInterestError } = await this.supabaseClient
        .from('case_interests')
        .delete()
        .match({ attorney_id: attorneyId, case_id: caseId });
    
      if (deletedInterestError && deletedInterestError.code !== 'PGRST204') {
        console.error('[updateCaseStatus] Error deleting interest:', deletedInterestError);
        throw new Error(`Error deleting interest: ${deletedInterestError.message}`);
      }
      
      console.log('[updateCaseStatus] Successfully deleted interest');
      return null;
    }

    // Update status
    const { data, error } = await this.supabaseClient
      .from('case_interests')
      .update({
        status: newStatus,
        updated_at: new Date().toISOString()
      })
      .match({ attorney_id: attorneyId, case_id: caseId })
      .select()
      .maybeSingle();

    if (error) {
      console.error('[updateCaseStatus] Error updating status:', error);
      throw new Error(`Error updating case status: ${error.message}`);
    }

    console.log(`[updateCaseStatus] Successfully updated case ${caseId} to status: ${newStatus}`);
    return data;
  }

  async getCaseDetails(attorneyId: string, caseId: string) {
    console.log(`[getCaseDetails] Attorney ${attorneyId} getting details for case ${caseId}`);
    
    // Check if case is retained by another attorney
    const { data: retainedInterest, error: retainedError } = await this.supabaseClient
      .from('case_interests')
      .select('attorney_id')
      .match({ case_id: caseId, status: CaseStatus.RETAINED })
      .single();

    if (retainedError && retainedError.code !== 'PGRST116') {
      console.error('[getCaseDetails] Error checking retained status:', retainedError);
    }

    if (retainedInterest && retainedInterest.attorney_id !== attorneyId) {
      console.log(`[getCaseDetails] Case ${caseId} is retained by another attorney: ${retainedInterest.attorney_id}`);
      throw new ForbiddenException('Case has been retained by another attorney');
    }

    // Fetch case data with full details
    const { data: caseData, error: caseError } = await this.supabaseClient
      .from('cases')
      .select(`
        *,
        enable_conflict_checks,
        clients (*),
        questionnaire_responses,
        client_case_summary
      `)
      .eq('id', caseId)
      .maybeSingle();

    if (caseError) {
      console.error('[getCaseDetails] Error fetching case data:', caseError);
    }

    if (!caseData) {
      console.log(`[getCaseDetails] Case ${caseId} not found`);
      throw new NotFoundException('Case not found');
    }

    console.log(`[getCaseDetails] Found case ${caseId}, enable_conflict_checks: ${caseData.enable_conflict_checks}`);

    // Fetch attorney's interest details
    const { data: interest, error: interestError } = await this.supabaseClient
      .from('case_interests')
      .select(`
        status
      `)
      .match({ attorney_id: attorneyId, case_id: caseId })
      .single();

    if (interestError && interestError.code !== 'PGRST116') {
      console.error('[getCaseDetails] Error fetching attorney interest:', interestError);
    }

    const interestStatus = interest?.status;
    console.log(`[getCaseDetails] Interest status for attorney ${attorneyId} on case ${caseId}: ${interestStatus || 'None'}`);

    // Determine what information can be viewed based on status
    console.log('[getCaseDetails] Filtering case details based on current status');
    const processedCaseData = this.filterCaseDetails(caseData, interestStatus, caseData.enable_conflict_checks);

    const result = {
      ...processedCaseData,
      status: interestStatus || null,
      enableConflictChecks: caseData.enable_conflict_checks
    };

    console.log(`[getCaseDetails] Returning filtered case data with status: ${result.status}`);
    return result;
  }

  private filterCaseDetails(caseData: any, currentStatus?: CaseStatus, enableConflictChecks?: boolean) {
    console.log(`[filterCaseDetails] Filtering details for case ${caseData.id}`);
    console.log(`[filterCaseDetails] Current status: ${currentStatus || 'None'}, enable_conflict_checks: ${enableConflictChecks}`);
    
    // If no conflict checks are enabled, return full details
    if (!enableConflictChecks) {
      console.log('[filterCaseDetails] No conflict checks enabled, returning full details');
      return caseData;
    }

    // If no interest has been expressed yet, return minimal details
    if (!currentStatus) {
      console.log('[filterCaseDetails] No interest expressed yet, returning minimal details');
      
      const minimalData = {
        id: caseData.id,
        legalCategory: caseData.legalCategory,
        aiGeneratedSummary: caseData.aigeneratedsummary,
        county: caseData.county,
        zip_code: caseData.zip_code,
        created_at: caseData.created_at,
        enableConflictChecks: caseData.enable_conflict_checks,
        clients: {
          id: caseData.clients.id,
          zip_code: caseData.clients.zip_code
        }
      };
      
      console.log('[filterCaseDetails] Minimal data fields:', Object.keys(minimalData));
      return minimalData;
    }

    // Determine visibility based on status
    const canViewFullDetails = [
      CaseStatus.AWAITING_ATTORNEY_CONFLICT_CHECK,
      CaseStatus.CONFLICT_CHECK_COMPLETED,
      CaseStatus.TERMS_SENT,
      CaseStatus.RETAINED
    ].includes(currentStatus);

    console.log(`[filterCaseDetails] Can view full details: ${canViewFullDetails}`);

    // If full details cannot be viewed, return minimal details
    if (!canViewFullDetails) {
      console.log('[filterCaseDetails] Cannot view full details, returning minimal details');
      
      const minimalData = {
        id: caseData.id,
        legalCategory: caseData.legalCategory,
        aiGeneratedHeading: caseData.aiGeneratedHeading,
        aiGeneratedSummary: caseData.aigeneratedsummary,
        county: caseData.county,
        zip_code: caseData.zip_code,
        created_at: caseData.created_at,
        enableConflictChecks: caseData.enable_conflict_checks,
        clients: {
          id: caseData.clients.id,
          zip_code: caseData.clients.zip_code
        }
      };
      
      console.log('[filterCaseDetails] Minimal data fields:', Object.keys(minimalData));
      return minimalData;
    }

    console.log('[filterCaseDetails] Returning full case details');
    return caseData;
  }

  private isValidStatusTransition(currentStatus: CaseStatus, newStatus: CaseStatus): boolean {
    console.log(`[isValidStatusTransition] Checking transition from ${currentStatus} to ${newStatus}`);
    
    const validTransitions = {
      [CaseStatus.INTEREST_EXPRESSED]: [
        CaseStatus.AWAITING_ATTORNEY_CONFLICT_CHECK,
        CaseStatus.NO_LONGER_INTERESTED
      ],
      [CaseStatus.AWAITING_CLIENT_CONFLICT_CHECK]: [
        CaseStatus.AWAITING_ATTORNEY_CONFLICT_CHECK,
        CaseStatus.NO_LONGER_INTERESTED
      ],
      [CaseStatus.AWAITING_ATTORNEY_CONFLICT_CHECK]: [
        CaseStatus.CONFLICT_CHECK_COMPLETED,
        CaseStatus.NO_LONGER_INTERESTED
      ],
      [CaseStatus.CONFLICT_CHECK_COMPLETED]: [
        CaseStatus.TERMS_SENT,
        CaseStatus.RETAINED,
        CaseStatus.NO_LONGER_INTERESTED
      ],
      [CaseStatus.TERMS_SENT]: [
        CaseStatus.RETAINED,
        CaseStatus.NO_LONGER_INTERESTED
      ],
      [CaseStatus.RETAINED]: [
        CaseStatus.NO_LONGER_INTERESTED
      ]
    };

    const isValid = validTransitions[currentStatus]?.includes(newStatus) || false;
    console.log(`[isValidStatusTransition] Transition is ${isValid ? 'valid' : 'invalid'}`);
    return isValid;
  }

  private applyLocationFilters(query: any, attorneyData: any, filters: FilterOptions) {
    console.log('[applyLocationFilters] Started applying location filters');
    console.log('[applyLocationFilters] Filters:', JSON.stringify(filters, null, 2));
    
    // Extract counties from attorneyData
    const subscribedCounties = attorneyData.countiesSubscribed?.map(
      (county: { name: string; state: string }) => this.normalizeCountyName(county.name)
    ) || [];
    
    console.log('[applyLocationFilters] Subscribed counties:', JSON.stringify(subscribedCounties, null, 2));
  
    // Handle specific county/zip filter if provided
    if (filters?.county) {
      const normalizedFilterCounty = this.normalizeCountyName(filters.county);
      console.log(`[applyLocationFilters] Filtering by specific county: ${normalizedFilterCounty}`);
      
      // Check if this is a large population county and zip code is provided
      if (this.isLargePopulation(normalizedFilterCounty) && filters.zipCode) {
        console.log(`[applyLocationFilters] Large population county with zip filter: ${filters.zipCode}`);
        return query.eq('zip_code', filters.zipCode);
      }
  
      // Check if we have zip codes for this county
      const countyZipCodes = attorneyData.zipCodesSubscribed?.[normalizedFilterCounty];
      if (countyZipCodes) {
        console.log(`[applyLocationFilters] Found zip codes for county ${normalizedFilterCounty}:`, JSON.stringify(countyZipCodes, null, 2));
        
        if (countyZipCodes.length === 0) {
          // Empty zip codes array means whole county
          console.log(`[applyLocationFilters] Empty zip codes array for ${normalizedFilterCounty}, using county name filter`);
          return query.or(`county.ilike.${normalizedFilterCounty},county.ilike.${normalizedFilterCounty} County`);
        } else {
          // Use specific zip codes
          console.log(`[applyLocationFilters] Using ${countyZipCodes.length} zip codes for county ${normalizedFilterCounty}`);
          return query.in('zip_code', countyZipCodes);
        }
      }
  
      // If county is in subscribedCounties, use county filter
      if (subscribedCounties.includes(normalizedFilterCounty)) {
        console.log(`[applyLocationFilters] County ${normalizedFilterCounty} found in subscribed counties, using county name filter`);
        return query.or(`county.ilike.${normalizedFilterCounty},county.ilike.${normalizedFilterCounty} County`);
      }
  
      // If county not found in either subscription, return empty result
      console.log(`[applyLocationFilters] County ${normalizedFilterCounty} not found in subscriptions, returning empty result`);
      return query.filter('id', 'in', '()'); // This ensures no results
    }
  
    // Build location conditions for all subscribed areas
    console.log('[applyLocationFilters] Building location conditions for all subscribed areas');
    const conditions = [];
    const zipCodes = [];
  
    // Process each subscribed county
    for (const county of subscribedCounties) {
      console.log(`[applyLocationFilters] Processing county: ${county}`);
      
      // Try both with and without "County" suffix to handle data inconsistency
      const countyWithSuffix = `${county} County`;
      console.log(`[applyLocationFilters] Looking for zip codes with key "${county}" or "${countyWithSuffix}"`);
      
      // Check if we have zip codes for this county (try both formats)
      const countyZipCodes = attorneyData.zipCodesSubscribed?.[county] || 
                             attorneyData.zipCodesSubscribed?.[countyWithSuffix];
      
      console.log(`[applyLocationFilters] Zip codes found in data:`, 
                  Object.keys(attorneyData.zipCodesSubscribed || {}).join(', '));
      
      if (countyZipCodes) {
        console.log(`[applyLocationFilters] Found zip codes for county ${county}:`, JSON.stringify(countyZipCodes, null, 2));
        
        if (countyZipCodes.length === 0) {
          console.log(`[applyLocationFilters] Empty zip codes array for ${county}, adding county to conditions`);
          conditions.push(county);
          conditions.push(`${county} County`);
        } else {
          // Add specific zip codes to the zip codes array
          console.log(`[applyLocationFilters] Adding ${countyZipCodes.length} zip codes from ${county} to zip code list`);
          zipCodes.push(...countyZipCodes);
        }
      } else {
        // No zip codes entry means use whole county
        console.log(`[applyLocationFilters] No zip codes entry for ${county}, using entire county`);
        conditions.push(county);
        conditions.push(`${county} County`);
      }
    }
  
    console.log(`[applyLocationFilters] Built ${conditions.length} county conditions and ${zipCodes.length} zip codes`);
    
    // Build the query
    if (conditions.length > 0 && zipCodes.length > 0) {
      console.log('[applyLocationFilters] Using both county and zip conditions');
      return query.or(`county.in.(${conditions.join(',')}),zip.in.(${zipCodes.join(',')})`);
    } else if (conditions.length > 0) {
      console.log('[applyLocationFilters] Using only county conditions');
      return query.in('county', conditions);
    } else if (zipCodes.length > 0) {
      console.log('[applyLocationFilters] Using only zip conditions');
      return query.in('zip', zipCodes);
    }
  
    console.log('[applyLocationFilters] No location conditions match, returning empty result');
    return query.filter('id', 'in', '()');
  }
  
  private normalizeCountyName(county: string): string {
    const normalized = county?.replace(/\s+county$/i, '').trim();
    console.log(`[normalizeCountyName] Normalized "${county}" to "${normalized}"`);
    return normalized;
  }

  private applyTimeFrameFilter(query: any, timeFrame?: string) {
    if (!timeFrame) {
      console.log('[applyTimeFrameFilter] No time frame specified, skipping filter');
      return query;
    }

    console.log(`[applyTimeFrameFilter] Applying time frame filter: ${timeFrame}`);
    const now = new Date();
    let startDate = new Date();

    switch (timeFrame) {
      case '24h':
        startDate.setHours(now.getHours() - 24);
        console.log(`[applyTimeFrameFilter] Using 24h filter: ${startDate.toISOString()}`);
        break;
      case '7d':
        startDate.setDate(now.getDate() - 7);
        console.log(`[applyTimeFrameFilter] Using 7d filter: ${startDate.toISOString()}`);
        break;
      case '30d':
        startDate.setDate(now.getDate() - 30);
        console.log(`[applyTimeFrameFilter] Using 30d filter: ${startDate.toISOString()}`);
        break;
      case '3m':
        startDate.setMonth(now.getMonth() - 3);
        console.log(`[applyTimeFrameFilter] Using 3m filter: ${startDate.toISOString()}`);
        break;
      case '6m':
        startDate.setMonth(now.getMonth() - 6);
        console.log(`[applyTimeFrameFilter] Using 6m filter: ${startDate.toISOString()}`);
        break;
      case 'ytd':
        startDate = new Date(now.getFullYear(), 0, 1);
        console.log(`[applyTimeFrameFilter] Using ytd filter: ${startDate.toISOString()}`);
        break;
      default:
        console.log(`[applyTimeFrameFilter] Unknown time frame: ${timeFrame}, skipping filter`);
        return query;
    }

    console.log(`[applyTimeFrameFilter] Filtering cases created after: ${startDate.toISOString()}`);
    return query.gte('created_at', startDate.toISOString());
  }

  private isLargePopulation(county: string): boolean {
    const largePopulationCounties = new Set([
      'Los Angeles',
      'Cook',
      'Harris',
      'Maricopa',
      'San Diego',
      'Orange',
      'Kings',
      'King',
      'Queens',
      'Riverside',
      'Clark',
      'Miami-Dade',
      'San Bernardino',
      'Dallas',
      'Bexar',
      'Tarrant'
    ]);
    
    const normalizedCounty = this.normalizeCountyName(county);
    const isLarge = largePopulationCounties.has(normalizedCounty);
    
    console.log(`[isLargePopulation] Checking if ${normalizedCounty} is a large population county: ${isLarge}`);
    return isLarge;
  }
}