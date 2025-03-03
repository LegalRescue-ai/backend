/* eslint-disable prettier/prettier */

 export  interface FilterOptions {
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
    }
    async getAvailableCases(attorneyId: string, filters: FilterOptions) {
      const { data: attorneyData, error: attorneyError } = await this.supabaseClient
        .from('attorneys')
        .select('countiesSubscribed, zipCodesSubscribed, areasOfPractice')
        .eq('id', attorneyId)
        .single();
    
      if (attorneyError || !attorneyData) {
        console.log(attorneyError);
        console.log(attorneyData);
        
        
        throw new NotFoundException('Attorney not found');
      }
    
      const { data: retainedCases } = await this.supabaseClient
        .from('case_interests')
        .select('case_id')
        .eq('status', CaseStatus.RETAINED);
    
      // Get this attorney's interested cases to exclude
      const { data: interestedCases } = await this.supabaseClient
        .from('case_interests')
        .select('case_id')
        .eq('attorney_id', attorneyId);
    
      const casesToExclude = [
        ...(retainedCases?.map(c => c.case_id) || []),
        ...(interestedCases?.map(i => i.case_id) || [])
      ];
    
      let query = this.supabaseClient
        .from('cases')
        .select(`
          id,
          created_at,
          legal_category,
          aigeneratedsummary
        `);


    
      if (casesToExclude.length > 0) {
      
        
        query = query.not('id', 'in', `(${casesToExclude})`);

      }
    
     
  
        query = query.in('legal_category', attorneyData.areasOfPractice);

    
      query = this.applyLocationFilters(query, attorneyData, filters);
      query = this.applyTimeFrameFilter(query, filters.timeFrame);
      
      if (filters.practiceArea) {
        query = query.eq('legal_category', filters.practiceArea);
      }
    
      if (filters.sortBy) {
        query = query.order(filters.sortBy, { ascending: filters.sortOrder === 'asc' });
      } else {
        query = query.order('created_at', { ascending: false });
      }
    
      const { data: cases, error } = await query;
      if (error) throw new Error(`Error fetching cases: ${error.message}`);
      
      return cases;
    }
  
    async getInterestedCases(attorneyId: string, filters: FilterOptions) {
      const { data: retainedCases } = await this.supabaseClient
        .from('case_interests')
        .select('case_id, attorney_id')
        .eq('status', CaseStatus.RETAINED);
  
      const retainedCaseMap = new Map(
        retainedCases?.map(c => [c.case_id, c.attorney_id]) || []
      );
  
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
        query = query.order(filters.sortBy, { ascending: filters.sortOrder === 'asc' });
      }
      
      
  
      const { data, error } = await query;
      if (error) throw new Error(`Error fetching interested cases: ${error.message}`);
     
      // Filter out cases retained by other attorneys
      return data?.filter(interest => {
        const retainingAttorney = retainedCaseMap.get(interest.case_id);
        if (!retainingAttorney) return true;
        return retainingAttorney === attorneyId;
      }).map(interest => {
        const canViewClientDetails = 
          interest.status === CaseStatus.AWAITING_CLIENT_CONFLICT_CHECK
  
        if (canViewClientDetails) {
          delete interest.cases.clients.first_name;
          delete interest.cases.clients.last_name;
          delete interest.cases.questionnaire_responses;
          delete interest.cases.client_case_summary;
          delete interest.cases.clients.zip_code;

        }
  
        return interest;
      });
    }
  
    async expressInterest(attorneyId: string, caseId: string): Promise<CaseInterest> {
      const { data: retainedInterest } = await this.supabaseClient
        .from('case_interests')
        .select('attorney_id')
        .match({ case_id: caseId, status: CaseStatus.RETAINED })
        .single();
  
      if (retainedInterest) {
        throw new ForbiddenException('Case has already been retained');
      }
  
      const { data: existingInterest } = await this.supabaseClient
        .from('case_interests')
        .select()
        .match({ attorney_id: attorneyId, case_id: caseId })
        .single();
  
      if (existingInterest) {
        throw new ForbiddenException('Interest already expressed');
      }
      let initialStatus;
      // Get case details
      const { data: caseData } = await this.supabaseClient
        .from('cases')
        .select('enable_conflict_checks')
        .eq('id', caseId)
        .single();
  
      if (!caseData) {
        throw new NotFoundException('Case not found');
      }
      if(caseData.enable_conflict_checks){
         initialStatus = CaseStatus.AWAITING_CLIENT_CONFLICT_CHECK
      }else{
         initialStatus = CaseStatus.AWAITING_ATTORNEY_CONFLICT_CHECK;

      }
  
      

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
  
      if (error) throw new Error(`Error expressing interest: ${error.message}`);
      return data;
    }
  
    async submitConflictCheck(attorneyId: string, caseId: string, ) {
      const { data: interest } = await this.supabaseClient
        .from('case_interests')
        .select('status, cases!inner(enable_conflict_checks, id)')
        .match({ attorney_id: attorneyId, case_id: caseId })
        .single();
  
      if (!interest) {
        throw new NotFoundException('Case interest not found');
      }
  
      // Check if case is retained by another attorney
      const { data: retainedInterest } = await this.supabaseClient
        .from('case_interests')
        .select('attorney_id')
        .match({ case_id: caseId, status: CaseStatus.RETAINED })
        .single();
  
      if (retainedInterest && retainedInterest.attorney_id !== attorneyId) {
        throw new ForbiddenException('Case has been retained by another attorney');
      }
  
     
  
      const { data, error } = await this.supabaseClient
        .from('case_interests')
        .update({
          status: CaseStatus.CONFLICT_CHECK_COMPLETED,
        })
        .match({ attorney_id: attorneyId, case_id: caseId })
        .select()
        .single();
  
      if (error) throw new Error(`Error submitting conflict check: ${error.message}`);
      return data;
    }
  
    async updateCaseStatus(attorneyId: string, caseId: string, newStatus: CaseStatus) {
      const { data: currentInterest } = await this.supabaseClient
        .from('case_interests')
        .select('status')
        .match({ attorney_id: attorneyId, case_id: caseId })
        .single();
  
      if (!currentInterest) {
        throw new NotFoundException('Case interest not found');
      }
  
      if (!this.isValidStatusTransition(currentInterest.status, newStatus)) {
        throw new ForbiddenException('Invalid status transition');
      }
  
      // Additional check for RETAINED status
      if (newStatus === CaseStatus.RETAINED) {
        const { data: existingRetained } = await this.supabaseClient
          .from('case_interests')
          .select('attorney_id')
          .match({ case_id: caseId, status: CaseStatus.RETAINED })
          .single();
  
        if (existingRetained) {
          throw new ForbiddenException('Case has already been retained');
        }
  
        // Verify conflict check is completed
        if (currentInterest.status !== CaseStatus.CONFLICT_CHECK_COMPLETED &&
            currentInterest.status !== CaseStatus.TERMS_SENT) {
          throw new ForbiddenException('Cannot retain case before completing conflict check');
        }
      }
      if (newStatus === CaseStatus.NO_LONGER_INTERESTED) {
        const { error: deletedInterestError } = await this.supabaseClient
          .from('case_interests')
          .delete()
          .match({ attorney_id: attorneyId, case_id: caseId }); 
      
        if (deletedInterestError && deletedInterestError.code !== 'PGRST204') {
          throw new Error(`Error deleting interest: ${deletedInterestError.message}`);
        }
      }
      
  
      const { data, error } = await this.supabaseClient
        .from('case_interests')
        .update({
          status: newStatus,
          updated_at: new Date().toISOString()
        })
        .match({ attorney_id: attorneyId, case_id: caseId })
        .select()
        .maybeSingle();
  
      if (error) throw new Error(`Error updating case status: ${error.message}`);
      return data;
    }
    async getCaseDetails(attorneyId: string, caseId: string) {
      // Check if case is retained by another attorney
      const { data: retainedInterest } = await this.supabaseClient
        .from('case_interests')
        .select('attorney_id')
        .match({ case_id: caseId, status: CaseStatus.RETAINED })
        .single();
  
      if (retainedInterest && retainedInterest.attorney_id !== attorneyId) {
        throw new ForbiddenException('Case has been retained by another attorney');
      }
  
      // Fetch case data with full details
      const { data: caseData } = await this.supabaseClient
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
  
      if (!caseData) {
        throw new NotFoundException('Case not found');
      }
  
      // Fetch attorney's interest details
      const { data: interest } = await this.supabaseClient
        .from('case_interests')
        .select(`
          status
        `)
        .match({ attorney_id: attorneyId, case_id: caseId })
        .single();
  
      // Determine what information can be viewed based on status
      const processedCaseData = this.filterCaseDetails(caseData, interest?.status, caseData.enable_conflict_checks);
  
      return {
        ...processedCaseData,
        status: interest?.status || null,
        enableConflictChecks: caseData.enable_conflict_checks
        
      };
    }
  
    private filterCaseDetails(caseData: any, currentStatus?: CaseStatus, enableConflictChecks?: boolean) {
      // If no conflict checks are enabled, return full details
      if (!enableConflictChecks) {
        return caseData;
      }
  
      // If no interest has been expressed yet, return minimal details
      if (!currentStatus) {
        return {
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
      }
  
      // Determine visibility based on status
      const canViewFullDetails = [
        CaseStatus.AWAITING_ATTORNEY_CONFLICT_CHECK,
        CaseStatus.CONFLICT_CHECK_COMPLETED,
        CaseStatus.TERMS_SENT,
        CaseStatus.RETAINED
      ].includes(currentStatus);
  
      // If full details cannot be viewed, return minimal details
      if (!canViewFullDetails) {
        return {
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
      }
  
      // Return full details
      return caseData;
    }
  
    
  
    private isValidStatusTransition(currentStatus: CaseStatus, newStatus: CaseStatus): boolean {
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
  
      return validTransitions[currentStatus]?.includes(newStatus) || false;
    }
  
   
    private applyLocationFilters(query: any, attorneyData: any, filters: FilterOptions) {
      // Extract counties from attorneyData
      const subscribedCounties = attorneyData.countiesSubscribed?.map(
        (county: { name: string; state: string }) => this.normalizeCountyName(county.name)
      ) || [];
    
      // Handle specific county/zip filter if provided
      if (filters?.county) {
        const normalizedFilterCounty = this.normalizeCountyName(filters.county);
        
        // Check if this is a large population county and zip code is provided
        if (this.isLargePopulation(normalizedFilterCounty) && filters.zipCode) {
          return query.eq('zip_code', filters.zipCode);
        }
    
        // Check if we have zip codes for this county
        const countyZipCodes = attorneyData.zipCodesSubscribed?.[normalizedFilterCounty];
        if (countyZipCodes) {
          if (countyZipCodes.length === 0) {
            // Empty zip codes array means whole county
            return query.or(`county.ilike.${normalizedFilterCounty},county.ilike.${normalizedFilterCounty} County`);
          } else {
            // Use specific zip codes
            return query.in('zip_code', countyZipCodes);
          }
        }
    
        // If county is in subscribedCounties, use county filter
        if (subscribedCounties.includes(normalizedFilterCounty)) {
          return query.or(`county.ilike.${normalizedFilterCounty},county.ilike.${normalizedFilterCounty} County`);
        }
    
        // If county not found in either subscription, return empty result
       return query.filter('id', 'in', '()');; // This ensures no results
      }
    
      // Build location conditions for all subscribed areas
     const conditions = [];
     const zipCodes = [];
    
      // Process each subscribed county
      for (const county of subscribedCounties) {
        // Check if we have zip codes for this county
        const countyZipCodes = attorneyData.zipCodesSubscribed?.[county];
        
        if (countyZipCodes) {
          if (countyZipCodes.length === 0) {
            conditions.push(county);
            conditions.push(`${county} County`);
          } else {
            // Add specific zip codes to the zip codes array
            zipCodes.push(...countyZipCodes);
          }
        } else {
          // No zip codes entry means use whole county
          conditions.push(county);
          conditions.push(`${county} County`);
        }
      }
    
      
    
      // Build the query
      if (conditions.length > 0 && zipCodes.length > 0) {
        return query.or(`county.in.(${conditions.join(',')}),zip.in.(${zipCodes.join(',')})`);
      } else if (conditions.length > 0) {
        return query.in('county', conditions);
      } else if (zipCodes.length > 0) {
        return query.in('zip', zipCodes);
      }
    
    
     return query.filter('id', 'in', '()');
    }
    
    private normalizeCountyName(county: string): string {
      return county?.replace(/\s+county$/i, '').trim();
    }


    private applyTimeFrameFilter(query: any, timeFrame?: string) {
      if (!timeFrame) return query;
  
      const now = new Date();
      let startDate = new Date();
  
      switch (timeFrame) {
        case '24h':
          startDate.setHours(now.getHours() - 24);
          break;
        case '7d':
          startDate.setDate(now.getDate() - 7);
          break;
        case '30d':
          startDate.setDate(now.getDate() - 30);
          break;
        case '3m':
          startDate.setMonth(now.getMonth() - 3);
          break;
        case '6m':
          startDate.setMonth(now.getMonth() - 6);
          break;
        case 'ytd':
          startDate = new Date(now.getFullYear(), 0, 1);
          break;
        default:
          return query;
      }
  
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
      return largePopulationCounties.has(normalizedCounty);
    }
  }
